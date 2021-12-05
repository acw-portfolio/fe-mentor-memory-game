import { ObservableModel, ObservableWatcher } from '@candlelib/wick';
import { Logger } from "@candlelib/log";
import spark from "@candlelib/spark";
import { number } from '@candlelib/wick/build/client';

const logger = Logger.createLogger("Match Game Messenger").activate();

interface Player {
    name: string,
    /**
     * The number of matches the player
     * has made
     */
    matches: number;
    /**
     * The number of moves the player
     * has taken. 
     */
    moves: number;

}

class Token {
    index: number;
    val: number;
    REVEALED: boolean;
    MATCHED: boolean;

    constructor(
        index: number,
        val: number
    ) {
        this.val = val;
        this.index = index;
        this.REVEALED = false;
        this.MATCHED = false;
    }
}

export class GameStore implements ObservableModel {
    players: Player[];
    tokens: Token[];
    candidate_matches: number[];
    grid_height: number;
    grid_width: number;

    /**
     * The number of identical tokens a player must match.
     * Set to 2 for now;
     */
    match_count: number;

    _SCHD_: number;

    OBSERVABLE: true;

    constructor(
        players: Player[],
        grid_w: number = 4,
        grid_h: number = 4
    ) {
        logger.debug(`Creating game with ${players.length} players and a ${grid_w}x${grid_h} grid`);

        this.players = players;

        this.grid_width = grid_w;

        this.grid_height = grid_h;

        this.tokens = [];

        this.candidate_matches = [];

        this.OBSERVABLE = true;

        this.match_count = 2;

        this.constructGrid();
    }

    get token_count() {
        return this.grid_height * this.grid_width;
    }

    private constructGrid() {

        const numbers = Array(this.token_count / 2)
            .fill(1).map(((i, j) => j + 1));

        const tokens = numbers.flatMap(i => [
            new Token(-1, i),
            new Token(-1, i),
        ]);

        tokens.sort((a, b) => (Math.random() * 10) - 5);

        tokens.forEach((t, i) => t.index = i);

        this.tokens.length = 0;

        this.tokens.push(...tokens);
    }

    private getTokenByIndex(i: number): Token {

        if (i < 0 || i > this.token_count)
            throw new Error(`Invalid index {${i}} used to retrieve token. Max index is ${this.token_count - 1}`);

        return this.tokens[i];
    }

    private getTokenByCoord(x: number, y: number): Token {

        const index = x + y * this.grid_width;

        if (index < 0 || index > this.token_count)
            throw new Error(`Invalid coords {${x} ,${y}} used to retrieve token. Max x coord is ${this.grid_height - 1} & Max y coord is ${this.grid_width - 1}`);

        return this.getTokenByIndex(index);
    }

    private getPlayerById(index: number) {
        if (index < 0 || index > this.players.length)
            throw new Error(`Invalid index {${index}} used to retrieve token. Max index is ${this.token_count - 1}`);

        return this.players[index];
    }
    private isMatch(
        token1_index: number,
        token2_index: number
    ): boolean {

        const tk1 = this.getTokenByIndex(token1_index);
        const tk2 = this.getTokenByIndex(token2_index);

        return tk1.val == tk2.val;
    }

    async addMatch(token_index: number) {
        //Validate token index
        this.getTokenByIndex(token_index);
        logger.debug(`Adding ${token_index} to candidate matches`);

        if (this.candidate_matches.length == this.match_count - 1) {
            const previous_token = this.candidate_matches.pop();

            if (previous_token == token_index) {
                logger.debug(`Reselected ${token_index}`);
                this.candidate_matches.push(token_index);
            } else if (this.isMatch(token_index, previous_token)) {
                logger.debug(`${token_index} & ${previous_token} match!`);
                this.toggleTokenMATCHED(token_index);
                this.toggleTokenMATCHED(previous_token);
            } else {
                logger.debug(`${token_index} & ${previous_token} do not match`);
                await spark.sleep(500);
                this.hideToken(token_index);
                this.hideToken(previous_token);
            }
        } else {
            this.candidate_matches.push(token_index);
        }
    }

    addPlayerPoint(player_index: number) {

        const player = this.getPlayerById(player_index);

        player.matches++;
    }

    addPlayerMove(player_index: number) {

        const player = this.getPlayerById(player_index);

        player.moves++;
    }
    toggleTokenMATCHED(token_index: number) {
        this.getTokenByIndex(token_index).MATCHED =
            !this.getTokenByIndex(token_index).MATCHED;
    }

    isTokenRevealed(token_index: number) { return this.getTokenByIndex(token_index).REVEALED; }

    hideToken(token_index: number) { this.getTokenByIndex(token_index).REVEALED = false; }

    revealToken(token_index: number) { this.getTokenByIndex(token_index).REVEALED = true; }

    get data() { return this; }

    subscribe(m: ObservableWatcher) {
        return true;
    }

    unsubscribe(m: ObservableWatcher) {
        return true;
    }

    private update_observers() {

    }
}

let ACTIVE_GAME = null;
/**
 * Returns
 */
export function getActiveGame() {
    return ACTIVE_GAME;
}

export function createGame(...args: any[]) {
    if (ACTIVE_GAME)
        ACTIVE_GAME.destroy();

    ACTIVE_GAME = new GameStore(...args);

    return ACTIVE_GAME;
}


export function appendMatch(index: number) {
    const game = getActiveGame();

    if (!game) throw new Error("There is no active game");

}