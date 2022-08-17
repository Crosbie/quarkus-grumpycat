import { Container, Sprite, BitmapText, game,loader, Vector2d, Stage, input,event, state, ParticleEmitter, Color, pool } from "melonjs/dist/melonjs.module.js";
//import { Math } from "melonjs/dist/melonjs.module.js";
import CONFIG from "../../config";
import GlobalGameState from "../util/global-game-state";
import SpiderEnemy from "../renderables/spider-enemy";
import { LevelManager } from "../util/level";
import NetworkManager from "../util/network";
import PlayerEntity from "../renderables/player";
import { my_state } from "../util/constants";
import { StateBackground } from "./state_background";

class MySpider extends SpiderEnemy {
	walkRight = true;

	constructor(x,y, dx, dy) {
		super(x,y)
		this.dx = dx;
		this.dy = dy;
		this.setCurrentAnimation("walk-right");
		this.body.force.set(1,0);
		this.body.friction.set(0.4,0);
		this.body.setMaxVelocity((Math.random() * 6)+1, 0);
	}

	update(dt) {

		if( this.walkRight ) {
			this.body.force.x = this.body.maxVel.x;
		}
		else {
			this.body.force.x = -this.body.maxVel.x;
		}
		super.update(dt);

		if( this.pos.x > game.viewport.width) {
			this.pos.x = game.viewport.width;
			this.setCurrentAnimation("walk-left");
			this.walkRight = false;

		}
		if( this.pos.x < 0 ) {
			this.pos.x = 0; 
			this.setCurrentAnimation("walk-right");
			this.walkRight = true;
		}
		return true;
	}

	calculateNextPosition() {
		
	}
}

class LevelDescription extends Container {
	constructor(x,y,width,height) {
		super(x,y,width,height);
		this.setOpacity(1);
		this.levelName = new BitmapText(4, 8, {
			font: "24Outline",
			size: "1",
			fillStyle: "white",
			textAlign: "left",
			text: LevelManager.getInstance().getCurrentLevel().longName,
			offScreenCanvas: false,
		});

		this.levelDescr = new BitmapText(4, 52, {
			font: "18Outline",
			size: "1",
			lineHeight: 1.5,
			fillStyle: "white",
			textAlign: "left",
			text: LevelManager.getInstance().getCurrentLevel().description,
			offScreenCanvas: false,
		});

		this.addChild(this.levelName);
		this.addChild(this.levelDescr);

	}
}
class GetReadyBack extends Container {
	constructor() {
		super();

		// make sure we use screen coordinates
		this.floating = true;

		// always on toppest
		this.z = 10;

		this.setOpacity(1.0);

		// give a name
		this.name = "TitleBack";

		this.addChild(new StateBackground("GET READY"));
		this.addChild(new LevelDescription(190, game.viewport.height - 400), game.viewport.width - 400, game.viewport.height - 400);

		let player1 = new PlayerEntity(13, 9, true);
		player1.tint = pool.pull("Color", 255,55,55);		
		this.addChild(player1);

		let player2 = new PlayerEntity(17, 9, true);
		player2.tint = pool.pull("Color", 55,55,255);
		player2.flipX(true);		
		this.addChild(player2);

		let player3 = new PlayerEntity(15, 7, true);
		player3.tint = pool.pull("Color", 55, 255, 55);
		this.addChild(player3);

		let player4 = new PlayerEntity(15, 11, true);
		player4.tint = pool.pull("Color", 255, 255, 55);
		this.addChild(player4);

	}	
}

export default class GetReadyScreen extends Stage {
	spiders = [];

	/**
	 *  action to perform on state change
	 */
	onResetEvent() {
		this.spiders = [];

		console.log("GetReady.OnEnter()");
 
		this.back = new GetReadyBack();
		game.world.addChild(this.back);

		/*
		for( let i = 0; i < 200; i++ ) {
			let x = (Math.random() * (game.viewport.width / 32))+1;
			let y = (Math.random() * (game.viewport.height /32))+1;

			let dx = Math.random() * (game.viewport.width / 32) + 1;
			let dy = Math.random() * (game.viewport.height / 32) + 1;

			let spider = new MySpider(x,y, dx, dy);
			this.spiders.push(spider);
			game.world.addChild(spider, 10);
		}*/

		this.emitter = new ParticleEmitter(game.viewport.width/2, game.viewport.height / 2 + 100, {
			//image: loader.getImage("player"),
			tint: new Color(255,0,0),
			width: 64,
			height: 64,
			totalParticles: 30,
			gravity: 0.02,
			angle: 0,
            angleVariation: 6.283185307179586,			
			speed: 2,
			//wind: -1,
		} );
		game.world.addChild(this.emitter);
		this.emitter.streamParticles();

		// change to play state on press Enter or click/tap
		input.bindKey(input.KEY.ENTER, "enter", true);
		input.bindPointer(input.pointer.LEFT, input.KEY.ENTER);

		this.handler = event.on(event.KEYUP, function (action, keyCode, edge) {
			if (!state.isCurrent(state.READY)) return;
			console.log("GetReady.EventHandler()");
			if (action === "enter" || action === "bomb") {

				NetworkManager.getInstance().createGameOnServer()
				.then(function() {
					state.change(state.PLAY);
					input.unbindKey(input.KEY.ENTER);
					input.unbindPointer(input.pointer.LEFT);
				})
				.catch(function(err) {
					console.error("Error creating new game on server: " + err);
					state.change(state.MENU);
				});				
			}
			if (action === "exit") {
				state.change(my_state.SINGLE_PLAYER_MENU);
			}
		});
	}

	/**
	 *  action to perform when leaving this screen (state change)
	 */
	onDestroyEvent() {
		console.log("GetReady.OnExit()");
		input.unbindKey(input.KEY.ENTER);
		input.unbindPointer(input.pointer.LEFT);
		event.off(event.KEYUP, this.handler);
		game.world.removeChild(this.back);
		for( let i = 0; i < this.spiders.length; i++ ) {
			game.world.removeChild(this.spiders[i]);
		}
		game.world.removeChild(this.emitter);
	}
}
