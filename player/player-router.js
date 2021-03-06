/*
	Player / Player-Router

	Description:
	- This is a collection of lower level player-DB communication

	- "Player" model reference:
        - Attributes:
            > slack_id: string | Player's slack ID
            > name : string | Player slack name
            > team_id : string | This account's workspace id
            > team_domain : string | This account's workspace domain
            > bank : int | Amount of Chips in bank
            > lastLobby : string | Last Played Lobby
            > wallet : int | Amount of Chips in wallet (withdrawn)
        > isInLobby : Boolean | Whether player is current in a lobby ( on record )		- refer to player/player-model.js

    Exports:
        - createPlayer
		- checkIn
		- checkOut
		- withdraw
        - deposit
        - getPlayer
*/

const player = require('./player-model');
const async = require('async');

/*----------------------------------------------------------------------------------
|	[Player / Player-Router.js] Create Player
|
|	Description:
|	- Creates a player instance 
|	- and saves to DB
|
|	 																				*/
const createPlayer = async (data) => {
    try {
        const newPlayer = new player(data);		    // Constructs a player locally with the passed in data {user_id and user_name}
        data.res = await newPlayer.save(); 					// This pushes the locally created player up to the DB
        return data;
    } catch (e) {
        // error statement
        console.log(e);
        return e;
    }
}
//----------------------------------------------------------------------------------


/*----------------------------------------------------------------------------------
|	[Player / Player-Router.js] Check-in Player
|
|	Description:
|	- Player has joined a lobby 
|	- Arguments: {user_id, lobby_id, buyin}
|   - Update: bank, wallet, lastLobby, isInLobby
|   - Does not check if lobby exist
| 
|	 																				*/
const checkIn = async (data) => {
    try {
        // #debug -----------------------------
        // console.log('\n----------- player/player-router.js -> checkIn() ---------------');
        // console.log('----- data -----\n');
        // console.log(data);
        // ------------------------------------

        let thisPlayer = await player.findOne({ slack_id: data.slack_id, team_id: data.team_id });

        // #debug -----------------------------
        // console.log('\n----- thisPlayer -----\n');
        // console.log(thisPlayer);
        // ------------------------------------

        /*      Catch No User error             */
        if (!thisPlayer) {
            console.log('\nError at player/player-router.js -> checkIn()! Should not reach here, manager did not check if player exist in dB.\n');
            return null;
        }

        /*      Player can join the lobby       */
        if (thisPlayer.bank >= data.buyin && thisPlayer.isInLobby === false) {

            /*       Update Player data         */
            thisPlayer.bank -= data.buyin;
            thisPlayer.wallet = data.buyin;
            thisPlayer.lastLobby = data.lobby_id;
            thisPlayer.isInLobby = true;
            //------------------------------------

            /*        Push Player updates        */
            const updatedPlayer = await player.findOneAndUpdate({ slack_id: thisPlayer.slack_id, team_id: thisPlayer.team_id }, thisPlayer, { new: true });
            // #debug -----------------
            // console.log("\n------------- player-routers.js -> checkIn() ---------------");
            // console.log(updatedPlayer);
            //-------------------------
            return updatedPlayer;
        }
        else {      /*      Player cannot join the lobby        */
            console.log('\nError at player/player-router.js -> checkIn()! Should not reach here, manager did not check for bank balance, player overdraft, or Player already in lobby, double-joined.\n');
            return null;
        }
    } catch (e) {
        // error statement
        console.log(e);
        return e;
    }
}
//----------------------------------------------------------------------------------

/*----------------------------------------------------------------------------------
|	[Player / Player-Router.js] Check-out Player
|
|	Description:
|	- Player has joined a lobby 
|	- Arguments: {user_id, lobby_name, buyin}
|   - Update: bank, wallet, lastLobby, isInLobby
|   - Does not check if lobby exist (no error, but may oversee bugs)
|	 																				*/
/**
 * 
 * @param {Object} data             Contains a slack_id and team_id
 * @param {String} data.slack_id    User's slack ID
 * @param {String} data.team_id     User's slack team ID
 * @returns {Object}                Player object from database
 */
const checkOut = async (data) => {
    try {
        let thisPlayer = await player.findOne({ slack_id: data.slack_id, team_id: data.team_id });
        /*      Catch No User error             */
        if (!thisPlayer) {
            console.log('\nError at player/player-router.js -> checkOut()! Should not reach here, manager did not check if player exist in dB.\n');
            return null;
        }

        /*      Player can leave lobby         */
        if (thisPlayer.isInLobby) {

            /*       Update Player data         */
            thisPlayer.bank += thisPlayer.wallet;
            thisPlayer.wallet = 0;
            thisPlayer.isInLobby = false;
            //------------------------------------

            /*        Push Player updates        */
            let updatedPlayer = await player.findOneAndUpdate({ slack_id: thisPlayer.slack_id, team_id: thisPlayer.team_id }, thisPlayer, { new: true });
            updatedPlayer.isInLobby = false;
            return updatedPlayer;
        }
        else {      /*      Player cannot join the lobby        */
            console.log('\nError at player/player-router.js -> checkOut()! Should not reach here, manager did not check if player exist\n');
            return null;
        }
    } catch (e) {
        // error statement
        console.log(e);
        return e;
    }
}
//----------------------------------------------------------------------------------


/**
 * [Player / Player-Router.js] Get Player - Returns one player if exist
 * @param {Object} data             Contains a slack_id and team_id
 * @param {String} data.slack_id    User's slack ID
 * @param {String} data.team_id     User's slack team ID
 * @returns {Object}                Player object from database
 */
const getOnePlayer = async (data) => {
    try {
        let thisPlayer;
        if (data.team_id) {
            thisPlayer = await player.findOne({ slack_id: data.slack_id, team_id: data.team_id });
        }
        else {
            thisPlayer = await player.findOne({ slack_id: data.slack_id, isInLobby: true });
        }
        return thisPlayer;
    } catch (e) {
        console.log(e);
        return null;
    }
}
//--------------------------------------------------------------------

/*--------------------------------------------------------------------
|	[Player / Player-Router.js] Withdraw
|
|	Description:
|	- Special usage, withdraw chips directly
|																	*/
const withdraw = async (data, chips) => {

}
//--------------------------------------------------------------------

/*--------------------------------------------------------------------
|	[Player / Player-Router.js] Deposit
|
|	Description:
|	- Special usage, deposit chips directly
|   - chips ensured to be positive or atleast zero
|																	*/
const deposit = async (data, chips) => {
    let thisPlayer = await getOnePlayer(data);
    if (!thisPlayer) {
        console.log('\n--------------------\nERROR! player-routers.js->deposit() could not find the player according to player_data\n--------------------------\n');
        return null;
    }
    /*       Update Player data         */
    thisPlayer.bank += chips;
    //------------------------------------

    /*       Push Player updates        */
    let updatedPlayer = await player.findOneAndUpdate({ slack_id: thisPlayer.slack_id, team_id: thisPlayer.team_id }, thisPlayer, { new: true });
    //updatedPlayer = await player.findById(updatedPlayer._id);

    return updatedPlayer;
}
//--------------------------------------------------------------------

/**
 * 
 * @param {Object []} playersEndGame   Ones that just get remaining chips
 * @param {Object []} winners  Ones that remaining chips + winning amount.
 * @returns [] An array of playerIds and chips to be updated.
 */
const calculateWinnings = (playersEndGame, winners) => {

    console.log("\n================= ./player/player-router.js -> calculateWinnings() ================")
    console.log("\n----- playerEndGame");
    console.log(playersEndGame);
    console.log("\n----- winners");
    console.log(winners);

    let playerWallets = []; // { playerId : x , chips : y}
    for (let w of winners) {
        let thisWinner = { playerId: w.playerId, chips: w.amount };
        playerWallets.push(thisWinner);
    }

    for (let player of playersEndGame) {
        let idx = playerWallets.findIndex(p => p.playerId === player.playerId);
        if (idx === -1) {
            //not in list yet
            let thisPlayer = { playerId: player.playerId, chips: player.chips };
            playerWallets.push(thisPlayer);
        }
        else {
            //already in list, add their remainder back.
            playerWallets[idx].chips = player.chips;
        }

    }
    return playerWallets;
}

/**
 * Updates player wallet. Needs playerId and chips from EACH player in playerList. (Option) if CLEAR_CARDS is true, also clears cards url on DB.
 * @param {Object} playerList 
 * @param {String} players_in_lobby local data 
 * @param {Boolean} CLEAR_CARDS
 */
const updatePlayerWallet = async (playerList, players_in_lobby, CLEAR_CARDS) => {
    let team_id = players_in_lobby[0].team_id;
    async.each(playerList, (player, callback) => {
        // const getCurrPlayerState = () => {
        let currP_idx = players_in_lobby.findIndex(P => P.slack_id === player.playerId);
        if (currP_idx === -1) { console.log("\n!!! currP could not be found ! in updatePlayerWallet()"); }
        //     return currP;
        // }

        // getCurrPlayerState()
        //     .then(currP => {
        getOnePlayer({ slack_id: player.playerId, team_id: team_id })
            .then(thisPlayer => {
                // console.log("\n============ updatePlayerWallet ===============");
                // console.log("Player = ", thisPlayer.name);
                // console.log("Wallet from DB = ", thisPlayer.wallet);
                // console.log("local_data copy of player = ");
                // console.log(players_in_lobby[currP_idx]);
                // console.log("---- what is player in msg.playerList:");
                // console.log(player);
                players_in_lobby[currP_idx].remaining_chips += player.chips;
                players_in_lobby[currP_idx].wallet = players_in_lobby[currP_idx].remaining_chips;
                thisPlayer.wallet = players_in_lobby[currP_idx].wallet;
                if (CLEAR_CARDS) { players_in_lobby[currP_idx].cards = ""; };
                // console.log("\n---- thisPlayer before saving:");
                // console.log(thisPlayer);
                thisPlayer.save();
            }).then(() => {
                callback();
            }).catch((err) => {
                console.log(err);
                throw new Error("Could not save or get");
            })
        // })
    }, (err, res) => {
        if (err) {
            console.log("Player-router.js | updatePlayerWallet ERROR | ")
            console.log(err);
        }

        if (res) {
            console.log("Updated wallet successfully.")
        }

    })
}


/**
 * Updates player wallet. Needs playerId and chips from EACH player in playerList. (Option) if CLEAR_CARDS is true, also clears cards url on DB.
 * @param {Object} playerList data from local_data
 * @param {Object} allPlayerStatus data from PHE
 */
const updateSetupPlayerWallet = async (players_in_lobby, allPlayersStatus) => {

    for (let i = 0; i < players_in_lobby.length; i++) {
        players_in_lobby[i].remaining_chips = allPlayersStatus[i].chips;
        players_in_lobby[i].wallet = players_in_lobby[i].remaining_chips;
        let thisPlayer = await getOnePlayer({ slack_id: players_in_lobby[i].slack_id, team_id: players_in_lobby[i].team_id });
        thisPlayer.wallet = players_in_lobby[i].wallet;
        thisPlayer.save();
    }
}


/**-------------------------------------------------------------------
 * [Player / Player-Router.js] Get Player
 * @param {String} lobby_id Mongoose Schema ObjectId
 * @returns {Array}         An array of players in that lobby
 */
const getAllPlayerInLobby = async (lobby_id) => {
    try {
        const playerList = await player.find({ lastLobby: lobby_id, isInLobby: true });
        // #debug ---------------------------------
        // console.log('--- player-router.js -> getAllPlayerInLobby() --- ');
        // console.log(playerList);
        //------------------------------------------
        return playerList;
    } catch (error) {
        console.log(error);
    }

}
//--------------------------------------------------------------------

/*--------------------------------------------------------------------
|	[Player / Player-Router.js] Delete All Players in DB
|
|	Description:
|	- Returns an array of players
|																	*/
const deletePlayerAll = async () => {
    try {
        const deletedPlayers = await player.deleteMany({});
        return deletedPlayers;
    } catch (e) {
        // error statements
        console.log(e);
        return e;
    }
}
//--------------------------------------------------------------------


/*--------------------------------------------------------------------
 * [Player / Player-Router.js] Get All Currently playing Players in team
 * @param   {Object}    data         bject that contains team_id
 * @param   {String}    data.team_id Used to search for a team in slack
 * @returns {Array}     An array of players in the team.
 */
const getAllCurrentPlayersInTeam = async (data) => {
    try {
        const playerList = await player.find({ team_id: data.team_id, isInLobby: true });
        return playerList;

    } catch (error) {
        // error statements
        console.log(error);
        return error;
    }

}


/**
 * [Player / Player-Router.js] Takes an entire player object and replaces its entry in the database
 * @param {Object} thisPlayer           Data to be updated. Is the entire entry
 * @param {String} thisPlayer.slack_id  Slack ID stored in database
 * @param {String} thisPlayer.team_id   Team ID stored in database
 * @returns {Object}                    Updated player
 */
const updatePlayer = async (thisPlayer) => {
    try {
        const updatedPlayer = await player.findOneAndUpdate({ slack_id: thisPlayer.slack_id, team_id: thisPlayer.team_id }, thisPlayer, { new: true });
        return updatedPlayer;

    } catch (error) {
        console.log(error);
        return error;
    }
}


module.exports = {
    createPlayer,
    checkIn,
    checkOut,
    withdraw,
    deposit,
    getOnePlayer,
    calculateWinnings,
    updatePlayerWallet,
    updateSetupPlayerWallet,
    getAllPlayerInLobby,
    deletePlayerAll,
    getAllCurrentPlayersInTeam,
    updatePlayer

};