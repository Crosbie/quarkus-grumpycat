import CONFIG from "../../config";
import { EventEmitter } from "./eventemitter";
import GlobalGameState from "./global-game-state";
import { LevelManager } from "./level";
import NetworkManager from "./network";

//let mm = MultiplayerManager.getInstance();
let multiplayerManager = null;

export const MultiplayerMessageType = {
	PLAYER_JOINED   : "PLAYER_JOINED",
	PLAYER_REMOVED  : "PLAYER_REMOVED",
	START_GAME      : "START_GAME",
	CLOSE_GAME      : "CLOSE_GAME",
	GAME_UPDATE     : "GAME_UPDATE",
    GAME_STARTED    : "GAME_STARTED",
    GAME_OVER       : "GAME_OVER",
	BROADCAST_CHAT  : "BROADCAST_CHAT",
    ERROR           : "ERROR",
};
export class MultiplayerMessage {
    
    static gameUpdate() {
        let mm = new MultiplayerMessage(MultiplayerMessageType.GAME_UPDATE);
        mm.playerId = multiplayerManager.multiplayerPlayer.id;
        mm.gameId   = multiplayerManager.multiplayerGame.id;
        return mm;
    }    

    static gameStarted() {
        let mm = new MultiplayerMessage(MultiplayerMessageType.GAME_STARTED);
        mm.gameId = multiplayerManager.multiplayerGame.id;
        mm.playerId = multiplayerManager.multiplayerPlayer.id;
        return mm;
    }

    static gameOver() {
        let mm = new MultiplayerMessage(MultiplayerMessageType.GAME_OVER);
        mm.gameId = multiplayerManager.multiplayerGame.id;
        mm.playerId = multiplayerManager.multiplayerPlayer.id;
        return mm;
    }

    constructor(type) {
        this.type = type;
        this.message = null;

        this.playerId = null;
        this.gameId = null;

        this.x = 0;
        this.y = 0;
        this.dx = 0;
        this.dy = 0;
        this.bombPlaced = false;
        this.gutterThrown = false;
        this.score = 0;
        this.energy = 0;

        this.levelOver = false;
        this.hasChanged = false;
    }    
}

 export default class MultiplayerManager {
	static getInstance() {
		if (multiplayerManager == null) {
			multiplayerManager = new MultiplayerManager();
		}
		return multiplayerManager;
	}

	constructor() {
		let baseURL = CONFIG.baseURL;
   
        this.networkManager = NetworkManager.getInstance();
        this.levelManager   = LevelManager.getInstance();

        // define URLs for the REST services
        this.createPlayerURL= baseURL + "mp-game/player";
        this.createGameURL  = baseURL + "mp-game/new";
        this.joinGameURL    = baseURL + "mp-game/join/"; // append gameId
        this.listGamesURL   = baseURL + "mp-game/open";
        this.closeGameURL   = baseURL + "mp-game/close/"; // append gameId/playerId
        this.getGameURL     = baseURL + "mp-game/" // append gameId
        this.startGameURL   = baseURL + "mp-game/start/"; // append gameId

        // the websocket
        this.multiplayerSocket = null;      
   		this.socketBaseURL = baseURL.substring(baseURL.indexOf("://") + 3);
  
        // game and player
        this.multiplayerGame   = null;
        this.multiplayerPlayer = null;

        this.selectedLevelForGame = null;
        this.selectedLevelIndex   = 0;
        this.multiplayerLevels    = this.levelManager.allMultiplayerLevels();
        this.weAreHost            = false;
        this.multiplayerGameToJoin= null;

        // callbacks for socket
        this.eventEmitter = new EventEmitter();

        this.onErrorCallback = null;
        this.onLeaveCallback = null;
        this.onJoinCallback  = null;
        this.onMessageCallback = [];
        this.onGameCloseCallback = null;
        this.onBroadcastCallback = null;
        this.onGameStartedCallback = null;
    }

    /**
     * 
     * @returns Returns initialized multiplayerPlayer
     */
    async createPlayerFromMe() {
        if( this.multiplayerPlayer === null || this.multiplayerPlayer.id === null ) {
            let res = await fetch(this.createPlayerURL, {
                method: "POST",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(GlobalGameState.globalServerGame.player),
            });

            this.multiplayerPlayer = await res.json();                        
        }
        return this.multiplayerPlayer;
    }

    /**
     * Closes the current active game, weather it is a host or just a player
     */
    async closeActiveGame() {
        if( this.multiplayerSocket !== null && this.multiplayerSocket.readyState !== 3) {
            this.multiplayerSocket.close();
            this.multiplayerSocket = null;

            this.onBroadcastCallback = null;
            this.onErrorCallback = null;
            this.onGameCloseCallback = null;
            this.onGameStartedCallback = null;
            this.onJoinCallback = null;
            this.onLeaveCallback = null;
            this.onMessageCallback = [];            
        }
        
        if( this.multiplayerGame !== null ) {
            this.weAreHost = false;
            console.log("CLOSING: ");
            console.log("  Game  : " + this.multiplayerGame.id);
            console.log("  Player: " + this.multiplayerPlayer.id);
            let res = await fetch(this.closeGameURL + this.multiplayerGame.id + "/" + this.multiplayerPlayer.id, {
                method: "PUT",
                mode: "cors",
            }); 

            this.multiplayerGame = null;
        }        

        this.eventEmitter.reset();
    }

    /**
     * Creates the multiplayer game and initializes the serverSocket to communicate
     * with other clients.
     * 
     * @returns the initialized MultiplayerGame
     */
    async createGame() {
        if( this.multiplayerGame !== null ) {
            await this.closeActiveGame();
        }
        if( this.multiplayerPlayer === null ) {
            await this.createPlayerFromMe();
        }

        const req = {
            game: {
                level: this.selectedLevelIndex,
            },
            host: this.multiplayerPlayer
        };

        let res = await fetch(this.createGameURL, {
            method: "POST",
            mode: "cors",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(req),
        });

        this.multiplayerGame = await res.json(); 
        
        console.log("  Created new MultiplayerGame: " + this.multiplayerGame.id);
        this._createMultiplayerSocket();

        this.weAreHost = true;
        return this.multiplayerGame;
    }

    /**
     * Sends the given action to the server so that all clients will recieve the update
     * 
     * @param {MultiplayerMessage} action 
     */
    async sendAction(action) {
        this.multiplayerSocket.send(JSON.stringify(action));
    }

    /**
     * Notify other clients that we're going to start now!
     */
    async sendGameStarted() {
        let mm = MultiplayerMessage.gameStarted();
        this.sendAction(mm);
    }

    /**
     * Update server to indicate that this game does not accept any more
     * players. Notify other players that we are starting NOW
     */
    async startGame() {
        if( this.weAreHost ) {
            await fetch(this.startGameURL + this.multiplayerGame.id, {
                method: "PUT",
                mode: "cors",
            });
            this.sendGameStarted();
        }
    }

    /**
     * Joins the selected game as player
     *
     */
    async joinGame() {
        if( this.multiplayerGame !== null ) {
            await this.closeActiveGame();
        }

        if( this.multiplayerPlayer === null ) {
            await this.createPlayerFromMe();
        }

        if( this.multiplayerGameToJoin !== null ) {
            console.log("  Joining multi player game: " + this.multiplayerGameToJoin.id);
            if (this.multiplayerSocket !== null) {
                this.multiplayerSocket.close();
                this.multiplayerSocket = null;
            }

            let res = await fetch(this.joinGameURL + this.multiplayerGameToJoin.id + "/" + this.multiplayerPlayer.id, {
                method: "PUT",
                mode: "cors",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            this.multiplayerGame = await res.json();
            this._createMultiplayerSocket();
            this.weAreHost = false;            
            this.multiplayerGameToJoin = null;
        }
    }

    /**
     * Creates the WebSocket to talk to server and other clients
     */
    _createMultiplayerSocket() {
        if (this.multiplayerSocket !== null) {
            this.multiplayerSocket.close();
            this.multiplayerSocket = null;
        }

        this.multiplayerSocket = new WebSocket("ws://" + this.socketBaseURL + "multiplayer/" + this.multiplayerGame.id + "/" + this.multiplayerPlayer.id);
        this.multiplayerSocket.addEventListener("error", (evt) => {
            console.log("  Socket error: " + evt);
            this.eventEmitter.emit(MultiplayerMessageType.ERROR, evt);
        });

        this.multiplayerSocket.addEventListener("message", (evt) => {
            const data = JSON.parse(evt.data);    
            
            switch(data.type) {
                case MultiplayerMessageType.PLAYER_JOINED:
                    console.log("  Player " + data.playerId + " joined the game:  " + data.message);
                    fetch(this.getGameURL + data.gameId)
                        .then( (res) => {
                            return res.json();
                        })
                        .then( (json) => {
                            this.multiplayerGame = json;
                            this.eventEmitter.emit(data.type, {
                                message: data,
                                game: json,
                            });
                        });                
                    break;

                case MultiplayerMessageType.PLAYER_REMOVED:
                    console.log("  Player " + data.playerId + " removed from game: " + data.message);
                    fetch(this.getGameURL + data.gameId)
                        .then((res) => {
                            return res.json();
                        })
                        .then((json) => {
                            this.multiplayerGame = json;

                            this.eventEmitter.emit(data.type, {
                                message: data,
                                game: json,
                            });
                        });                
                    break;

                case MultiplayerMessageType.CLOSE_GAME:
                    console.log("  Game is going to be closed now: " + data.message);
                    this.closeActiveGame().then( () => {
                        this.eventEmitter.emit(data.type, {
                            message: data,
                        });
                    });
                    break;

                case MultiplayerMessageType.GAME_STARTED:
                    console.log("  Game will be started now: " + data.message);
                    fetch(this.getGameURL + data.gameId)
                        .then((res) => {
                            return res.json();
                        })
                        .then((json) => {
                            this.multiplayerGame = json;
                            this.eventEmitter.emit(data.type, {
                                message: data,
                                game: json,
                            });

                        });                
                    break;

                case MultiplayerMessageType.BROADCAST_CHAT:
                    console.log("  [BROADCAST]: " + data.message);
                    this.eventEmitter.emit(data.type, {
                        message: data,
                    });
                    break;

                case MultiplayerMessageType.GAME_UPDATE:
                    // sending game update to game screen
                    this.eventEmitter.emit(data.type, {
                        message: data,
                    });
                    break;

                case MultiplayerMessageType.GAME_OVER:
                    // sending game update to game screen
                    this.eventEmitter.emit(data.type, {
                        message: data,
                    });
                    break;

                default:
                    console.log("Unknown Message Type: " + data.type);
                    break;
            }
        });

    }

    /**
     * 
     * @returns a array of open games coming from server to join them
     */
    async listOpenGames() {
        let res = await fetch(this.listGamesURL);
        return res.json();
    }

    
    addOnMessageCallback(callback) {
        this.eventEmitter.on(MultiplayerMessageType.GAME_UPDATE, callback);
    }

    setOnJoinCallback(callback) {
        if( callback ) 
            this.eventEmitter.on(MultiplayerMessageType.PLAYER_JOINED, callback);
        else 
            this.eventEmitter.allOff(MultiplayerMessageType.PLAYER_JOINED);
    }

    setOnLeaveCallback(callback) {
        if( callback ) {
            this.eventEmitter.on(MultiplayerMessageType.PLAYER_REMOVED, callback);
        }   
        else {
            this.eventEmitter.allOff(MultiplayerMessageType.PLAYER_REMOVED);
        }     
    }
    
    setOnErrorCallback(callback) {
        if( callback ) {
            this.eventEmitter.on(MultiplayerMessageType.ERROR, callback);
        }
        else {
            this.eventEmitter.allOff(MultiplayerMessageType.ERROR);
        }
    }

    setOnGameCloseCallback(callback) {
        if( callback )
            this.eventEmitter.on(MultiplayerMessageType.CLOSE_GAME, callback);
        else 
            this.eventEmitter.allOff(MultiplayerMessageType.CLOSE_GAME);
    }

    setOnBroadcastCallback(callback) {
        if( callback )
            this.eventEmitter.on(MultiplayerMessageType.BROADCAST_CHAT, callback);
        else 
            this.eventEmitter.allOff(MultiplayerMessageType.BROADCAST_CHAT);
    }

    setOnGameStartedCallback(callback) {
        if( callback ) 
            this.eventEmitter.on(MultiplayerMessageType.GAME_STARTED, callback);
        else 
            this.eventEmitter.allOff(MultiplayerMessageType.GAME_STARTED);
    }

    setOnGameOverCallback(callback) {
        if (callback) this.eventEmitter.on(MultiplayerMessageType.GAME_OVER, callback);
		else this.eventEmitter.allOff(MultiplayerMessageType.GAME_OVER);
    }
    
    /**
     * Uses the levelIndex as selected level to start a multiplayer game
     * @param {number} levelIndex 
     */
    useSelectedLevel(levelIndex) {
        this.selectedLevelIndex = levelIndex;
        this.selectedLevelForGame = this.levelManager.allMultiplayerLevels()[levelIndex];
    }

    /**
     * 
     * @returns array of all multiplayerLevels 
     */
    allLevels() {       
        console.log("MultiplayerManager.allLevels() => " + this.multiplayerLevels.length); 
        return this.multiplayerLevels;
    }

    setGameToJoin(game) {
        this.multiplayerGameToJoin = game;
    }
    
}