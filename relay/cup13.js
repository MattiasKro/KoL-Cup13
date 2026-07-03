/**
 * Cup13
 * Enhanced Cup of 13s interface for KoLMafia.
 *
 * Core library.
 *
 * @author Mattias Kronberg
 * @license MIT
 *
 * https://github.com/MattiasKro/KoL-Cup13
 */

"use strict";

(() => {

const BUILD_INFO = {
    name: "Cup13",
    version: "0.1.0",
    buildDate: "2026-07-01"
};

const STORAGE_KEY = "cup13.settings";

const ITEM_PATTERN =
    /^(.*?)\s+\((\d+)\)\s+-\s+(\d+)\s+Adv\.(?:,\s*(.*))?$/;

const EFFECT_TYPES = {
    STAT: "stat",
    RUNNETH: "runneth",
    UNKNOWN: "unknown"
};

/**
 * Represents one Cup of 13s ingredient.
 */
class Ingredient {

    constructor(data) {

        this.option = data.option;
        this.value = data.value;

        this.name = data.name;
        this.quantity = data.quantity;
        this.adv = data.adv;

        this.effect = data.effect;

        this.favorite = false;

        Object.freeze(this.effect);
        Object.freeze(this);

    }

}

/**
 * Parses HTML option elements into Ingredient objects.
 */
class Cup13Parser {

    parse(option) {

        const match = ITEM_PATTERN.exec(option.text);

        if (!match) {
            throw new Error(
                `Cup13: Unable to parse "${option.text}".`
            );
        }

        return new Ingredient({

            option,

            value: option.value,

            name: match[1],

            quantity: Number(match[2]),

            adv: Number(match[3]),

            effect: this.parseEffect(match[4])

        });

    }

    parseEffect(text) {

        if (!text) {
            return null;
        }

        text = text.trim();

        let match =
            /^(\d+)\s+(Muscle|Mysticality|Moxie)$/i.exec(text);

        if (match) {

            return {

                type: EFFECT_TYPES.STAT,

                amount: Number(match[1]),

                stat: match[2],

                text

            };

        }

        match =
            /^(\d+)\s+turns?\s+of\s+(.+)$/i.exec(text);

        if (match) {

            return {

                type: EFFECT_TYPES.RUNNETH,

                turns: Number(match[1]),

                name: match[2],

                text

            };

        }

        return {

            type: EFFECT_TYPES.UNKNOWN,

            text

        };

    }

}

/**
 * Handles persistence using localStorage.
 */
class Cup13Storage {

    constructor() {

        this.settings = this.createDefaults();

    }

    createDefaults() {

        return {

            favorites: new Set(),

            sort: {

                column: "name",

                dir: "asc"

            },

            filter: "All",

            slot: 1

        };

    }

    load() {

        const raw =
            localStorage.getItem(STORAGE_KEY);

        if (!raw) {

            this.settings = this.createDefaults();

            return;

        }

        try {

            const parsed = JSON.parse(raw);

            this.settings = {

                favorites: new Set(
                    parsed.favorites || []
                ),

                sort: parsed.sort || {

                    column: "name",

                    dir: "asc"

                },

                filter: parsed.filter || "All",

                slot: parsed.slot || 1

            };

        }
        catch {

            console.warn(
                "Cup13: Failed to load settings."
            );

            this.settings =
                this.createDefaults();

        }

    }

    save() {

        const data = {

            favorites: Array.from(
                this.settings.favorites
            ),

            sort: this.settings.sort,

            filter: this.settings.filter,

            slot: this.settings.slot

        };

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(data)
        );

    }

    isFavorite(value) {

        return this.settings
            .favorites
            .has(value);

    }

    setFavorite(value, favorite) {

        if (favorite) {

            this.settings
                .favorites
                .add(value);

        }
        else {

            this.settings
                .favorites
                .delete(value);

        }

        this.save();

    }

    toggleFavorite(value) {

        const favorite =
            !this.isFavorite(value);

        this.setFavorite(
            value,
            favorite
        );

        return favorite;

    }

}

 
