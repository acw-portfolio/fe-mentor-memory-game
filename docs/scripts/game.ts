import { Logger } from "@candlelib/log";
import spark from "@candlelib/spark";
import { ObservableModel, ObservableWatcher } from '@candlelib/wick';

const logger = Logger.createLogger("Match Game Messenger").activate();

class Player implements ObservableModel {
    name: string;
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

    ACTIVE: boolean;

    OBSERVABLE: true;

    component: ObservableWatcher;

    data: any;

    subscribe(obj: ObservableWatcher) {

        if (obj == this.component)
            return;

        if (this.component)
            this.component.removeModel();

        logger.debug(`Component subscribed to player ${this.name}`);

        this.component = obj;

        this.update_observer();

        return true;
    }

    unsubscribe(obj: ObservableWatcher) {

        if (obj == this.component)
            this.component = null;

        return true;
    }

    update_observer() {
        if (this.component)
            this.component.onModelUpdate(this);
    }


    constructor(
        name: string,
    ) {
        this.name = name;
        this.ACTIVE = false;
        this.OBSERVABLE = true;
        this.matches = 0;
        this.moves = 0;
    }
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

    GAME_STARTED: boolean;

    ALLOW_MOVE: boolean;

    GAME_OVER: boolean;

    observers: ObservableWatcher[];

    active_player_index: number;

    total_matches: number;

    constructor(
        players: number = 4,
        grid_w: number = 4,
        grid_h: number = 4
    ) {
        logger.debug(`Creating game with ${players} players and a ${grid_w}x${grid_h} grid`);

        this.players = Array(players).fill(0).map((_, j) => new Player(j + 1 + ""));

        this.players[0].ACTIVE = true;

        this.grid_width = grid_w;

        this.grid_height = grid_h;

        this.tokens = [];

        this.candidate_matches = [];

        this.observers = [];

        this.OBSERVABLE = true;
        this.ALLOW_MOVE = true;

        this.GAME_OVER = false;

        this.GAME_STARTED = false;

        this.match_count = 2;

        this.constructGrid();

        this.active_player_index = 0;

        this.total_matches = 0;
    }

    get token_count() {
        return this.grid_height * this.grid_width;
    }

    private constructGrid() {

        const numbers = Array(this.token_count / 2)
            .fill(1).map(((i, j) => j + 1));

        const temp = numbers.flatMap(i => [
            new Token(-1, i),
            new Token(-1, i),
        ]);

        const tokens = [];

        while (temp.length > 0) {
            const len = temp.length;
            const index = Math.min(len - 1, Math.max(0, Math.random() * len));

            tokens.push(...temp.splice(index, 1));
        }


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

        if (!this.GAME_OVER && this.ALLOW_MOVE) {
            this.GAME_STARTED = true;
            this.ALLOW_MOVE = false;
            //Validate token index
            this.getTokenByIndex(token_index);

            this.revealToken(token_index);

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
                    this.revealToken(token_index);
                    this.revealToken(previous_token);
                    this.addPlayerMove(this.active_player_index);
                    this.addPlayerPoint(this.active_player_index);
                    this.players[this.active_player_index].update_observer();
                    this.total_matches += 2;
                } else {
                    logger.debug(`${token_index} & ${previous_token} do not match`);

                    if (this.players.length == 1) {
                        this.ALLOW_MOVE = true;
                        await spark.sleep(500);
                    } else {
                        await spark.sleep(600);
                    }
                    this.hideToken(token_index);
                    this.hideToken(previous_token);
                    this.addPlayerMove(this.active_player_index);
                    this.setNextPlayer();
                }
            } else {
                this.candidate_matches.push(token_index);
            }

            if (this.total_matches == this.token_count) {
                this.GAME_OVER = true;
                this.update_observers();
            }

            this.ALLOW_MOVE = true;
        }
    }


    setNextPlayer() {
        const p_curr = this.players[this.active_player_index];
        const next = (this.active_player_index + 1) % this.players.length;

        if (next != this.active_player_index) {
            const p_next = this.players[next];
            logger.debug(`Switching from player ${p_curr.name} to player ${p_next.name}`);
            p_next.ACTIVE = true;
            p_curr.ACTIVE = false;
            p_next.update_observer();
            this.active_player_index = next;
        }

        p_curr.update_observer();
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

        if (this.observers.includes(m))
            return false;

        this.observers.push(m);

        m.onModelUpdate(this);

        return true;
    }

    unsubscribe(m: ObservableWatcher) {
        const index = this.observers.indexOf(m);
        if (index >= 0)
            this.observers.splice(index, 1);
        return true;
    }

    private update_observers() {
        for (const observer of this.observers) {
            observer.onModelUpdate(this);
        }
    }

    destroy() {
        this.tokens = [];
        this.observers.map(o => o.removeModel());

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