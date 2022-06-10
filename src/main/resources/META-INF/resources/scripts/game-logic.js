// global key states
let rightPressed = false;
let leftPressed = false;
let upPressed = false;
let downPressed = false;
let spacePressed = false;
let dropStonePressed = false;

// global game states
let onTitleScreen = true;
let titleScreenSelectedEntry = 0;
let automatedPlayMode = false;

let gamePaused = true;
let gameOver = false;
let levelWon = false;
let catSpeed = CAT_SPEED;
let lastTimestamp = 0;
let numPoints = 0;
let currentLevel = 1;
let numLevels = 3;
let score = 0;
let maxScore = 0;
let numBombs = 5;
let bombsThrown = 0;
let ctx;
let canvas;
let enemies;
let camera;

let serverGame;



// load images
let loader = new PxLoader(),
	catLeft = loader.addImage("images/cat_left.png"),
	catRight = loader.addImage("images/cat_right.png"),
	pauseImg = loader.addImage("images/pause.png"),
	gameOverImg = loader.addImage("images/gameOver.png"),
	mouseImg = loader.addImage("images/sensa_jaa.png"),
	gameOverDog = loader.addImage("images/sensa_nee.png"),
	levelWonDog = loader.addImage("images/sensa_jaa.png"),
	bombTiles = loader.addImage("/images/tilesets/BombExploding.png"),
	terrainTiles = loader.addImage("/images/tilesets/terrain.png");	

// This is the entry point of the game.   
function setupGame() {
	// add a completion listener to the image loader which inits the game
	loader.addCompletionListener(initGame);
	loader.start();
}

// we need to get key downs / ups
function keyDownHandler(event) {
	if (event.code == "ArrowUp" || event.code == "KeyW") upPressed = true;
	if (event.code == "ArrowLeft" || event.code == "KeyA") leftPressed = true;
	if (event.code == "ArrowRight" || event.code == "KeyD") rightPressed = true;
	if (event.code == "ArrowDown" || event.code == "KeyS") downPressed = true;
	if (event.code == "Space") spacePressed = true;
	if( event.code == "ShiftLeft" || event.code == "ShiftRight") dropStonePressed = true;
}

function keyUpHandler(event) {
	if (event.code == "ArrowUp" || event.code == "KeyW") upPressed = false;
	if (event.code == "ArrowLeft" || event.code == "KeyA") leftPressed = false;
	if (event.code == "ArrowRight" || event.code == "KeyD") rightPressed = false;
	if (event.code == "ArrowDown" || event.code == "KeyS") downPressed = false;
	if (event.code == "KeyP") gamePaused = !gamePaused;
	if (event.code == "Space") spacePressed = false;
	if (event.code == "ShiftLeft" || event.code == "ShiftRight") dropStonePressed = false;
	//console.log("KeyUp with " + event.code);
}

// init game
function initGame() {
	canvas = document.getElementById("maze");
	if (canvas.getContext) {
		ctx = canvas.getContext("2d");

		ctx.imageSmoothingEnabled = true;
		ctx.imageSmoothingQuality = "high";

		document.addEventListener("keydown", keyDownHandler, false);
		document.addEventListener("keyup", keyUpHandler, false);

		currentLevel = 0;
		numBombs = 5;
		maxScore = 0;

		fetch("/maps/")
			.then(function(response) {
				return response.json();
			})
			.then(function(result) {
				numLevels = result;
				initLevel();
			});
	}
}


async function createGameOnServer(level) {
	let resp = await fetch("/faker");
	let name = await resp.text();

	let req = {
		name: name,
		level: level,
		player: {
			name: name
		}
	};

	resp = await fetch("/game", {
		method: 'POST',
		headers: {
			'Content-type': 'application/json;charset=utf-8'
		},
		body: JSON.stringify(req)
	});

	serverGame = await resp.json();
	console.log("  New game '" + serverGame.name + "' for player '" + serverGame.player.id + "' initialized. ID =  " + serverGame.id);

} 

// function to load a level from server and
function loadAndInitializeLevel(currentLevel) {
	let name = "Level" + (currentLevel + 1);
	fetch("/maps/" + currentLevel)
		.then(function (response) {
			if (!response.ok) {
				throw new Error("Could not load map file /maps/" + name + ".tmj");
			}
			return response.json();
		})
		.then(function (result) {
			console.log("current level loaded: " + result);
			renderer = new TiledMapRenderer();
			renderer.parse(result);

			renderer.player.image = mouseImg;

			catSpeed = CAT_SPEED;

			enemies = renderer.enemies;
			for (let i = 0; i < enemies.length; i++) {
				enemies[i].image = catLeft;
				enemies[i].catLeft = catLeft;
				enemies[i].catRight = catRight;
			}

			camera = renderer.camera;
			console.log(camera);
			camera.centerAround(renderer.player.x, renderer.player.y);

			numPoints = 0;
			maxScore += renderer.countMaxScore();

			window.requestAnimationFrame(gameLoop);
		})
		.catch(function (error) {
			console.log("Error loading game map: " + error);
		});
	
}

// initialize it to use it locally
function initLevel() {
	// download a new level
	console.log("initalizing level " + (currentLevel + 1) + " / " + numLevels);

	bombsThrown = 0;
	gameOver = false;
	gamePaused = true;
	levelWon = false;
	automatedPlayMode = false;

	// call server to generate a Game and a Player
	createGameOnServer(currentLevel).then(function () {
		loadAndInitializeLevel(currentLevel);		
	});
}

// main game loop: move player, move enemy, update maze
function gameLoop(timestamp) {
	let elapsed = timestamp - lastTimestamp;

	if( !automatedPlayMode ) {
		if (elapsed > 100) {
			lastTimestamp = timestamp;

			if (!gamePaused && !gameOver && !onTitleScreen) {
				if (--catSpeed == 0) {
					updateEnemy();
					catSpeed = CAT_SPEED;
				}
				updatePlayer();
				drawMaze();
				drawStatus();
			}

			if (gamePaused && !gameOver) {
				ctx.clearRect(0, 0, MAZE_WIDTH, MAZE_HEIGHT );
				ctx.drawImage(pauseImg, (MAZE_WIDTH - pauseImg.width) / 2, (MAZE_HEIGHT - pauseImg.height) / 2);
			}

			if (gameOver) {
				drawGameOver();
			}

			if (levelWon) {
				drawLevelWon();
			}

			if( onTitleScreen ) {
				drawTitleScreen();
			}
		}
	}
	else {

	}
	window.requestAnimationFrame(gameLoop);
}

function drawCenteredText(text, y) {
	let width = ctx.measureText(text).width;
	let x = (canvas.width-width)/2;
	ctx.fillText(text, x, y);
	return x;
}

function drawTitleScreen() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	let menueEntries = [
		{
			title: "New Game",
			action: initGame,
		},
		{
			title: "See last game",
			action: playLastRun,
		},
		{
			title: "Highscores",
			action: showHightscores
		},
	];
	
	let y = 140;

	ctx.save();
	ctx.font = "32px Arial";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.shadowBlur = 20;
	ctx.shadowColor = "red";
	ctx.fillStyle = "white";

	for(let i = 0; i < menueEntries.length; i++ ) {
		if( titleScreenSelectedEntry == i ) {
			ctx.fillStyle = "#4695eb";
		}
		else {
			ctx.fillStyle = "white";
		}
		let x = drawCenteredText(menueEntries[i].title, y);
		y+=80;
	}

	if( upPressed ) {
		titleScreenSelectedEntry -= 1;
		if( titleScreenSelectedEntry <0 ) titleScreenSelectedEntry = menueEntries.length-1;
	}
	if( downPressed) {
		titleScreenSelectedEntry +=1;
		if( titleScreenSelectedEntry > menueEntries.length) titleScreenSelectedEntry = 0;
	}

	ctx.restore();
	if( spacePressed ) {
		spacePressed = false;
		gameOver = false;
		onTitleScreen = false;
		currentLevel = 0;
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		menueEntries[titleScreenSelectedEntry].action();
	}
}

function showHightscores() {
	console.log("Showing highscores");
}

function playLastRun() {
	console.log("playing last run");
	loadAndInitializeLevel();
	automatedPlayMode = true;
}

function drawLevelWon() {
	ctx.clearRect(0, 0, MAZE_WIDTH, MAZE_HEIGHT+20);
	ctx.drawImage(levelWonDog, (MAZE_WIDTH - levelWonDog.width) / 2, (MAZE_HEIGHT - levelWonDog.height) / 2);

	ctx.font = "22px Arial";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillStyle = "white";

	ctx.fillText("Press <space> to play next level", MAZE_WIDTH - 620, MAZE_HEIGHT);

	if (spacePressed) {
		ctx.clearRect(0, 0, MAZE_WIDTH, MAZE_HEIGHT+20);
		spacePressed = false;
		gameOver = false;

		currentLevel++;
		if( currentLevel < numLevels ) {
			initLevel();
		}
		else {
			console.log("All levels played!");
			currentLevel = 0;
			initLevel();
		}
	}
}

function drawGameOver() {
	score = 0;
	maxScore = 0;
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	ctx.drawImage(gameOverDog, (MAZE_WIDTH - gameOverDog.width) / 2, (MAZE_HEIGHT - gameOverDog.height) / 2);
	ctx.drawImage(gameOverImg, (MAZE_WIDTH - 620) / 2, 10, 620, 400);

	ctx.font = "22px Arial";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillStyle = "white";

	ctx.fillText("Press <space> to start again", MAZE_WIDTH - 620, MAZE_HEIGHT + 8);

	if (spacePressed) {
		spacePressed = false;
		gameOver = false;
		onTitleScreen = true;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		currentLevel = 0;
		//initLevel();
	}
}

// draws the currently loaded map
function drawMaze() {
	let time = new Date().getMilliseconds();
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	renderer.draw(ctx);	
	let elapsed = new Date().getMilliseconds() - time;
	//console.log("time to draw: " + elapsed);
}

function drawStatus() {
	ctx.clearRect(0, MAZE_HEIGHT, MAZE_WIDTH, 32);

	ctx.font = "20px Arial";
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.fillStyle = "white";
	ctx.fillText("SCORE: " + score + " of " + maxScore , 10, MAZE_HEIGHT + 8);
	ctx.fillText("LEVEL: " + (currentLevel + 1) + " of " + numLevels, 300, MAZE_HEIGHT + 8);
	ctx.fillText("BOMBS: " + bombsThrown + " of " + numBombs, 600, MAZE_HEIGHT + 8)
}

function updatePlayer() {
	let oldX = renderer.player.x,
		oldY = renderer.player.y;

	const action = {
		playerId: serverGame.player.id,
		gameId: serverGame.id,
		dx: 0,
		dy: 0,
		bombPlaced: false,
		gutterThrown: false,
		gameOver: false,
		gameWon: false,
		score: score,
		time: Date.now()
	};

	if( !dropStonePressed ) {
		if (upPressed) {
			renderer.player.y -= 1;
			action.dy = -1;
			if( renderer.player.y < 0) {
				renderer.player.y = 0;
				action.dy = 0;
			}
		}

		if (downPressed) {
			renderer.player.y += 1;
			action.dy = +1;
			if (renderer.player.y > renderer.mapHeight) {
				renderer.player.y = renderer.mapHeight;
				action.dy = 0;
			}
		}

		if (leftPressed) {
			renderer.player.x -= 1;
			action.dx = -1;
			if (renderer.player.x <= 0) {
				renderer.player.x = 0;
				action.dx = 0;
			}
		}

		if (rightPressed) {
			renderer.player.x += 1;
			action.dx = +1;
			if (renderer.player.x >= renderer.mapWidth) {
				renderer.player.x = renderer.player.x;
				action.dx = 0;
			}
		}

		// get tile and check if it's walkable
		if( !renderer.isWalkable(renderer.player.x, renderer.player.y) ){
			// wall
			renderer.player.x = oldX;
			renderer.player.y = oldY;
			action.dx = 0;
			action.dy = 0;
		}

		camera.centerAround(renderer.player.x, renderer.player.y);
	

		let bonus = renderer.checkForBonus(renderer.player.x, renderer.player.y);
		if (bonus != 0) {
			score += 10;
			if( bonus == BONUS_BOMB ) {
				numBombs += 5;
			}
			
			if( score >= maxScore ) {
				levelWon = true;
				action.gameWon = true;
			}
			action.score = score;
		}

		// check to see if player wants to place a bomb
		if( spacePressed ) {
			if( bombsThrown < numBombs ) {
				renderer.placeBomb(
					new PlacedBomb(
						renderer.player.x, 
						renderer.player.y,
						bombTiles,
						camera
					)
				);
				bombsThrown++;
				action.bombPlaced = true;
			}
		}
	}
	else {
		let dirX = 0, dirY = 0;
		if( leftPressed ) dirX =-1;
		if( rightPressed) dirX =+1;
		if( upPressed)	  dirY =-1;
		if( downPressed)  dirY =+1;
		renderer.placeBarrier(renderer.player.x + dirX, renderer.player.y + dirY);
		action.gutterThrown = true;
		action.dx = dirX;
		action.dy = dirY;
	}

	// check to see if ANY cat reached mouse
	for( let e = 0; e < enemies.length; e++) {
		if (renderer.player.x == enemies[e].catX && renderer.player.y == enemies[e].catY) {
			gameOver = true;
			action.gameOver = true;
			break;
		}
	}

	// only update server if anything has changed!
	if( action.dx != 0 || action.dy != 0 || action.gutterThrown || action.bombPlaced || action.gameOver || action.gameWon) {
		updateGameServer(action);
	}
}

async function updateGameServer(action) {
	let resp = await fetch("/movement", {			
		method: 'POST',
		headers: {
			'Content-type': 'application/json;charset=utf-8'
		},
		body: JSON.stringify(action)
	});

	if( !resp.ok) console.log("  could not update player action on server!");
}

// calculate the next step, the cat does
function updateEnemy() {
	for( let e = 0; e < enemies.length; e++ ) {
		let enemy = enemies[e];
		enemy.calculateNextMove(renderer);
	}
}
