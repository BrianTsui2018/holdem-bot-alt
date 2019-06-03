"use strict";

const Tournament = require("poker-holdem-engine");
const childProcess = require("child_process");

//Our tournament: 
let configs = JSON.parse(process.argv[2]);  //Parse tournament setting
let t = new Tournament(configs.tournamentID, configs.playerList, configs.tournamentSettings);

//Forks a child to handle image generation
let imageThread = childProcess.fork("./card-gen/card-generator.js");

// TODO : REMOVE BEFORE PRODUCTION
const chalk = require('chalk');
const error = chalk.bold.red;
const warning = chalk.keyword('orange');


// DEBUG : IF IMGUR IS DOWN SWITCH THIS TO FALSE.
const HAVE_CARDS = true;

//One additional listener to track acknowledgement from parent
const events = require('events');
const pidgeon = new events.EventEmitter();
const pidgeon_index = new events.EventEmitter();    //Event emitter for index.js updates
const pidgeon_image = new events.EventEmitter();    //Event emitter for image updates

//Variables for tracking
let pairsURL = null;                                //For user's private cards URLS
let commonURL = [];                                 //For common cards image URLs
let commonCardsFromGameState = [];                  //Stores card objects generated by PHE. 


/**
 * On this event, index has acknowledged recv'ing tournament's updates.
 * pidgeon_index catches this event and the main pidgeon would then emit an event to
 * proceed the tournament to the next stage.
 *  */
pidgeon_index.on("recieved acknowledgement", () => {
    // console.log("PIDGEON: Index acknlowedged! Proceeding to done.")
    pidgeon.emit("Proceed Tournament");
});

/**
 * On this event, Tournament is notified that its data is ready to be sent to index.
 * pidgeon_index catches this event and sends all data to index.js
 *  */
pidgeon_index.on("Data ready", (data) => {
    process.send({ topic: "updates", data }, () => {
        //Runs when confirmation is recv'ed
        console.log("Process sent updates to index.js");
    });
})

/**
 * On this event, Tournament is notified that its child process (card-generator.js) has returned image urls.
 * pidgeon_image catches this event and sets the data to the corresponding variables.
 *  */
pidgeon_image.on("recieved images", (message, imgData) => {
    console.log("PIDGEON IMAGE: I have new images!");
    if (message === "pairs") {
        pairsURL = imgData;
    }
    else if (message === "common") {
        commonURL.push(imgData);
    }
})

/**
 * On this event, Tournament has returned an update. We now check if image data is needed.
 * A small wait is forced into the script if it was the FIRST set of images.
 * The common cards afterwards should not require any wait time.
 * Once the images are incorporated, pidgeon_index fires a "Data ready" event.
 *  */
pidgeon.on("Check for image data", (data) => {
    if (data.type === 'setup') {
        setTimeout(() => {
            if (pairsURL) {
                console.log(chalk.grey.bold("Found the images, adding to data."))
                data.cardImages = pairsURL;
                pairsURL = null;
            }
            pidgeon_index.emit("Data ready", data);
        }, 8000)
    }
    else {
        pidgeon_index.emit("Data ready", data);
    }
})


//Each time when PHE/Tournament.js has an update, this will catch it
t.on("TOURNAMENT:updated", (data, done) => {
    console.log(chalk.bgCyan('Tournament | Updated!'));

    dataRouter(data);

    pidgeon.once("Proceed Tournament", (msg) => {
        console.log(warning("Tournament | Got the message!"));
        //Done() kicks the tournament to the next step.
        done();
    })
});


//Communication area for tournament.js and card-generator.js
imageThread.on("message", (msg) => {
    switch (msg.topic) {
        case "pairs":
            console.log(chalk.green("Image Thread : Got images back"));
            console.log(chalk.bgCyan('-------IMAGES---PAIRS-----------'))
            console.log(msg.data);
            console.log(chalk.bgCyan('--------------xxxxxx------------'))
            //////////// PIDGEON
            pidgeon_image.emit("recieved images", msg.topic, msg.data);
            //////////// PIDGEON
            let firstThreeCards = commonCardsFromGameState.splice(0, 3);
            console.log('First Three Cards to Child : ', JSON.stringify(firstThreeCards));
            imageThread.send({ topic: "common-cards", data: firstThreeCards, HAVE_CARDS });

            break;
        case "common":
            console.log(chalk.green("Image Thread : Got images back"));
            console.log(chalk.bgCyan('-------IMAGES--!COMMON!----------'))
            console.log(msg.data);
            console.log(chalk.bgCyan('--------------xxxxxx------------'))
            //////////// PIDGEON
            pidgeon_image.emit("recieved images", msg.topic, msg.data);
            //////////// PIDGEON
            if (commonCardsFromGameState.length > 0) {
                console.log(chalk.cyan('Got common cards back, and common cards obj list has '));
                console.log(commonCardsFromGameState)

                imageThread.send({ topic: "common-cards", data: [commonCardsFromGameState.shift()], HAVE_CARDS })
            } else {
                console.log(chalk.cyan('commonCardsFromGameState.length is now ', commonCardsFromGameState.length));
                console.log(chalk.cyan("Removing Image thread!"));
                imageThread.kill();
                console.log(chalk.cyan("Child thread removed"));
            }
            break;
        default:
            console.log(chalk.green("Image Thread : Uncaught message - ", msg.topic))
    }
});




//Main communication processes with parent (index.js) here.
process.on("message", async (msg) => {
    switch (msg.topic) {
        case "start-game":
            console.log(chalk.green("tournament | Msg = start-game | Starting !"));
            await t.start();
            break;
        case "pause-game":
            console.log(warning("tournament | Msg = pause-game | Attempting to pause...."))
            t.pause();
            console.log(t.state)
            console.log(warning('----------------------------------------'))
            break;
        case "restart-game":
            console.log(warning("tournament | Msg = restart-game | Attempting to restart"));
            t.restart();
            console.log(t.state);
            console.log(warning('-----------------------------------------'))
            break;
        case "quit-game":
            console.log(warning("tournament | Msg = restart-game | Attempting to quit"));
            t.quit();
            //process.send({ topic: "exit" });
            console.log(warning("-----------------------------------------"))
            break;
        case "acknowledgement":
            //console.log(error("tournament | Msg = acknowledgement. Attemping to leave loop......."));
            //////////// PIDGEON
            pidgeon_index.emit("recieved acknowledgement");
            //////////// PIDGEON
            console.log(warning("------------------------------------------"))
            break;
        case "continue":
            imageThread = childProcess.fork("./card-gen/card-generator.js");
            pidgeon_index.emit("recieved acknowledgement")
            break;
        default:
            console.log(error(`Uncaught msg topic found : ${msg.topic}`));
    }
})


/**
 * Adds additional game state information and/or images to the data if necessary.
 * @param {Object} data Tournament object returned by the PHE.
 */
const dataRouter = (data) => {
    if (data.type === 'setup') {
        //Make child thread to make card-pairs
        imageThread.send({ topic: "card-pairs", data: data.players, HAVE_CARDS });

        /*      Patch data to send out to start tournament      */
        data.bigBlindPosition = t.gamestate.bigBlindPosition;
        data.smallBlindPosition = data.bigBlindPosition - 1 >= 0 ? data.bigBlindPosition - 1 : data.players.length - 1;
        data.dealerPosition = data.smallBlindPosition - 1 >= 0 ? data.smallBlindPosition - 1 : data.players.length - 1;
        data.nextBetPosition = data.bigBlindPosition + 1 === data.players.length ? 0 : data.bigBlindPosition + 1;
        commonCardsFromGameState = t.gamestate.deck.slice(0, 5);
        data.allPlayersStatus = t.gamestate.players;
        data.nextPlayerStatus = t.gamestate.players[data.nextBetPosition];
        data.nextPlayerStatus.already_bet = false;
        data.callAmount = t.gamestate.callAmount;
        data.pot = t.gamestate.pot;
        data.sidepots = t.gamestate.sidepots;
        data.minBet = t.gamestate.sb * 2;
        //console.log(t.gamestate);

        // #debug ----------------------------
        // console.log("\n-------------- tournament2.js -> dataRouter(data) case = setup ------------------");
        // console.log("t.gamestate = ");
        // console.log(t.gamestate);
    }
    else if (data.type === 'cards') {
        //Cards Should be back by now, first card = first roll.
        /*      Patch data to send out to start tournament      */
        data.cardImages = commonURL.shift();
        let x = t.gamestate.bigBlindPosition - 1 >= 0 ? t.gamestate.bigBlindPosition - 1 : t.gamestate.players.length - 1;
        let n = 0;
        data.allPlayersStatus = t.gamestate.players;
        data.nextPlayerStatus = t.gamestate.players[x];
        while (data.nextPlayerStatus.state === 'fold' && n <= t.gamestate.players.length) {
            x += 1;
            if (x === t.gamestate.players.length) {
                x = 0;
                n++;
            }
            data.nextPlayerStatus = t.gamestate.players[x];
        }
        data.nextBetPosition = x;
        data.skipped = n;
        data.nextPlayerStatus.already_bet = false;
        data.callAmount = t.gamestate.callAmount;
        data.pot = t.gamestate.pot;
        data.sidepots = t.gamestate.sidepots;
        data.minBet = t.gamestate.sb * 2;

        // patch in symbols for players
        // for (let i = 0; i < t.gamestate.players.length; i++) {
        //     if (t.gamestate.players[i][Symbol.for("already-bet")] === true || t.gamestate.players[i][Symbol.for("all-in")] === true) {
        //         data.allPlayersStatus[i].already_bet = true;
        //     } else
        //         data.allPlayersStatus[i].already_bet = false;
        // }


        // #debug ----------------------------
        // console.log("\n-------------- tournament2.js -> dataRouter(data) case = cards ------------------");

    } else if (data.type === 'showdown') {
        // #debug ----------------------------
        // console.log("\n-------------- tournament2.js -> dataRouter(data) case = showdown ------------------");
        // console.log("\n---- gamestate ----");
        // console.log(t.gamestate);
        // console.log("\n---- data ----");
        // console.log(data);

    } else if (data.type === 'bet' || data.type === 'state') {
        // #debug ----------------------------
        // console.log("\n-------------- tournament2.js -> dataRouter(data) case = bet/state ------------------");
        // console.log("\n---- gamestate ----");
        // console.log(t.gamestate);
        // console.log("\n---- data ----");
        // console.log(data);
        data.nextBetPosition = -1;
        data.nextPlayerStatus = {};
        data.allPlayersStatus = t.gamestate.players;
        // patch in symbols for players
        for (let i = 0; i < t.gamestate.players.length; i++) {
            if (t.gamestate.players[i][Symbol.for("already-bet")] === true || t.gamestate.players[i][Symbol.for("all-in")] === true) {
                data.allPlayersStatus[i].already_bet = true;
            } else
                data.allPlayersStatus[i].already_bet = false;
        }

        data.callAmount = t.gamestate.callAmount;
        data.pot = t.gamestate.pot;
        data.sidepots = t.gamestate.sidepots;
        data.minBet = t.gamestate.sb * 2;
        if (t.gamestate.lastRaiseAmount) { data.lastRaiseAmount = t.gamestate.lastRaiseAmount; }
        else { data.lastRaiseAmount = 0; }

    } else if (data.type === 'win') {
        //Grab everyone's chips and shove to data.
        let playerAndChips = [];
        let pIdx = 0;
        for (let player of t.gamestate.players) {
            let thisPlayer = { playerId: configs.playerList[pIdx].id, chips: player.chips, chipsBet: player.chipsBet }
            pIdx++;
            playerAndChips.push(thisPlayer);
        }
        data.playersEndGame = [...playerAndChips];

        // #debug ----------------------------
        // console.log("\n-------------- tournament2.js -> dataRouter(data) case = win  ------------------");
        // console.log("\n---- gamestate ----");
        // console.log(t.gamestate);
        // console.log("\n---- data ----");
        // console.log(data);

    }

    pidgeon.emit("Check for image data", data);
}