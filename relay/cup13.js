/*
 * Cup13 - a Tabulator-based replacement UI for the KoLMafia
 * "Cup of 13s" IotM relay page.
 *
 * File: cup13.js
 * Contains: BUILD_INFO, Cup13Parser, Cup13Storage, Cup13Model, Cup13App
 *
 * The UI layer (Cup13App's rendering + Tabulator wiring) lives in
 * cup13.ui.js and is loaded separately.
 */

var Cup13 = Cup13 || {};

(function (Cup13) {
    "use strict";

    // ------------------------------------------------------------------
    // Build info
    // ------------------------------------------------------------------

    var BUILD_INFO = {
        name: "Cup13",
        version: "0.1.0",
        buildDate: "2026-07-01"
    };

    Cup13.build = BUILD_INFO;

    // ------------------------------------------------------------------
    // Cup13Parser
    //
    // Turns the raw text of a single <option> (plus its value attribute)
    // into an Ingredient object. Not meant to be extensible - if the
    // in-game format changes, this parser gets a new version instead of
    // being generalized.
    // ------------------------------------------------------------------

    function Cup13Parser() {}

    // Matches: "Item Name (123) - 5 Adv." or
    //          "Item Name (123) - 5 Adv., 100 Muscle" or
    //          "Item Name (123) - 5 Adv., 20 turns of Runneth Cold"
    Cup13Parser.OPTION_PATTERN =
        /^(.*?)\s*\((\d+)\)\s*-\s*(\d+)\s*Adv\.(?:,\s*(.+))?$/;

    // Matches stat bonuses: "100 Muscle", "50 Mox", "150 Mys"
    Cup13Parser.STAT_PATTERN =
        /^(\d+)\s+(Muscle|Mysticality|Moxie|Mus|Mox|Mys)$/;

    Cup13Parser.STAT_NAMES = {
        Muscle: "Muscle",
        Mus: "Muscle",
        Mysticality: "Mysticality",
        Mys: "Mysticality",
        Moxie: "Moxie",
        Mox: "Moxie"
    };

    // Matches runneth effects: "20 turns of Runneth Cold"
    Cup13Parser.RUNNETH_PATTERN =
        /^(\d+)\s+turns?\s+of\s+(Runneth\s+.+)$/;

    // Maps each Runneth effect name to what it actually does, per
    // https://wiki.kingdomofloathing.com/Cup_of_13s_(Mix_and_Drink)
    // Used to show the real bonus instead of just the effect's name.
    Cup13Parser.RUNNETH_DETAILS = {
        "Runneth Over": "+50% Item Drops from Monsters",
        "Runneth On Empty": "+100% Meat from Monsters",
        "Runneth Wild": "+100% Combat Initiative",
        "Runneth With The Pack": "+5 to Familiar Weight",
        "Runneth a Tight Ship": "+5 Familiar Experience Per Combat",
        "Runneth a Fever": "Superhuman Hot Resistance (+5)",
        "Runneth Cold": "Superhuman Cold Resistance (+5)",
        "Runneth On Fumes": "Superhuman Stench Resistance (+5)",
        "Runneth For Thy Life": "Superhuman Spooky Resistance (+5)",
        "Runneth Into Thine Ex": "Superhuman Sleaze Resistance (+5)"
    };

    // Parses a single <option> element into an Ingredient object.
    // Returns null if the text doesn't match the expected format.
    Cup13Parser.prototype.parseOption = function (optionElement) {
        var text = optionElement.textContent || optionElement.innerText || "";
        var value = optionElement.value;

        var match = Cup13Parser.OPTION_PATTERN.exec(text.trim());
        if (!match) {
            return null;
        }

        var name = match[1];
        var quantity = parseInt(match[2], 10);
        var adv = parseInt(match[3], 10);
        var extra = match[4] || null;

        return {
            value: value,
            name: name,
            quantity: quantity,
            adv: adv,
            effect: this.parseEffect(extra)
        };
    };

    // Parses everything after "X Adv., " into an effect object.
    Cup13Parser.prototype.parseEffect = function (extraText) {
        if (!extraText) {
            return null;
        }

        var statMatch = Cup13Parser.STAT_PATTERN.exec(extraText);
        if (statMatch) {
            var amount = parseInt(statMatch[1], 10);
            var stat = Cup13Parser.STAT_NAMES[statMatch[2]];
            return {
                type: "stat",
                stat: stat,
                amount: amount,
                text: extraText
            };
        }

        var runnethMatch = Cup13Parser.RUNNETH_PATTERN.exec(extraText);
        if (runnethMatch) {
            var turns = parseInt(runnethMatch[1], 10);
            var runnethName = runnethMatch[2];
            var details = Cup13Parser.RUNNETH_DETAILS[runnethName];

            // Show what the effect actually does instead of just its
            // name. Falls back to the raw "X turns of <name>" text for
            // any Runneth effect not yet in RUNNETH_DETAILS (e.g. a
            // new one added by a future IotM update), so nothing breaks.
            var displayText = details ?
                (turns + " turns of " + details) :
                extraText;

            return {
                type: "runneth",
                turns: turns,
                name: runnethName,
                details: details || null,
                text: displayText
            };
        }

        return {
            type: "unknown",
            text: extraText
        };
    };

    // Parses every <option> in a <select> element into an array of
    // Ingredient objects. Options that fail to parse are skipped rather
    // than crashing the whole page.
    Cup13Parser.prototype.parseSelect = function (selectElement) {
        var ingredients = [];
        var options = selectElement.options;

        for (var i = 0; i < options.length; i++) {
            var ingredient = this.parseOption(options[i]);
            if (ingredient) {
                ingredients.push(ingredient);
            }
        }

        return ingredients;
    };

    Cup13.Parser = Cup13Parser;

    // ------------------------------------------------------------------
    // Cup13Storage
    //
    // Wraps a single localStorage key ("cup13.settings") holding user
    // preferences: favorites, sort order, active filter, and active slot.
    // Ingredient data itself is never stored here - only user settings.
    // ------------------------------------------------------------------

    function Cup13Storage(storageKey) {
        this.storageKey = storageKey || "cup13.settings";
    }

    Cup13Storage.DEFAULT_SETTINGS = function () {
        return {
            favorites: [],
            sort: { field: "name", direction: "asc" },
            filter: "all",
            search: "",
            activeSlot: 1
        };
    };

    Cup13Storage.prototype.load = function () {
        var raw;
        try {
            raw = window.localStorage.getItem(this.storageKey);
        } catch (e) {
            return Cup13Storage.DEFAULT_SETTINGS();
        }

        if (!raw) {
            return Cup13Storage.DEFAULT_SETTINGS();
        }

        try {
            var parsed = JSON.parse(raw);
            return this.mergeWithDefaults(parsed);
        } catch (e) {
            return Cup13Storage.DEFAULT_SETTINGS();
        }
    };

    // Fills in any missing fields with defaults, in case a future
    // version adds new settings that don't exist in an older saved blob.
    Cup13Storage.prototype.mergeWithDefaults = function (settings) {
        var defaults = Cup13Storage.DEFAULT_SETTINGS();
        settings = settings || {};

        return {
            favorites: settings.favorites || defaults.favorites,
            sort: settings.sort || defaults.sort,
            filter: settings.filter || defaults.filter,
            search: settings.search || defaults.search,
            activeSlot: settings.activeSlot || defaults.activeSlot
        };
    };

    Cup13Storage.prototype.save = function (settings) {
        try {
            window.localStorage.setItem(
                this.storageKey,
                JSON.stringify(settings)
            );
        } catch (e) {
            // Storage may be unavailable (private browsing, quota, etc).
            // Failing silently is acceptable here - favorites/sort just
            // won't persist across page loads.
        }
    };

    Cup13.Storage = Cup13Storage;

    // ------------------------------------------------------------------
    // Cup13Model
    //
    // Holds the parsed ingredient list plus all user-facing state:
    // favorites, sort, filter, search query, and active slot. Contains
    // no DOM references - the model describes data, the UI describes
    // presentation.
    // ------------------------------------------------------------------

    function Cup13Model(ingredients, storage) {
        this.ingredients = ingredients || [];
        this.storage = storage;
        this.settings = storage.load();
    }

    Cup13Model.prototype.persist = function () {
        this.storage.save(this.settings);
    };

    // --- Favorites ---------------------------------------------------

    Cup13Model.prototype.isFavorite = function (value) {
        return this.settings.favorites.indexOf(value) !== -1;
    };

    Cup13Model.prototype.toggleFavorite = function (value) {
        var index = this.settings.favorites.indexOf(value);
        if (index === -1) {
            this.settings.favorites.push(value);
        } else {
            this.settings.favorites.splice(index, 1);
        }
        this.persist();
    };

    // --- Active slot ---------------------------------------------------

    Cup13Model.prototype.getActiveSlot = function () {
        return this.settings.activeSlot;
    };

    Cup13Model.prototype.setActiveSlot = function (slotNumber) {
        this.settings.activeSlot = slotNumber;
        this.persist();
    };

    // --- Sort ----------------------------------------------------------

    Cup13Model.prototype.getSort = function () {
        return this.settings.sort;
    };

    Cup13Model.prototype.setSort = function (field) {
        var current = this.settings.sort;
        if (current.field === field) {
            current.direction = current.direction === "asc" ? "desc" : "asc";
        } else {
            current.field = field;
            current.direction = "asc";
        }
        this.persist();
    };

    // --- Filter ----------------------------------------------------------

    Cup13Model.prototype.getFilter = function () {
        return this.settings.filter;
    };

    Cup13Model.prototype.setFilter = function (filterId) {
        this.settings.filter = filterId;
        this.persist();
    };

    // --- Search ----------------------------------------------------------

    Cup13Model.prototype.getSearch = function () {
        return this.settings.search;
    };

    Cup13Model.prototype.setSearch = function (query) {
        this.settings.search = query;
        this.persist();
    };

    // --- Filter option generation ---------------------------------------

    // Builds the list of dynamic filter options based on what's actually
    // present in the ingredient data. Always includes "All", "Has effect"
    // and "No effect".
    Cup13Model.prototype.buildFilterOptions = function () {
        var options = [
            { id: "all", label: "All" },
            { id: "has-effect", label: "Has effect" },
            { id: "no-effect", label: "No effect" }
        ];

        var advValues = {};
        var statCombos = {};
        var runnethNames = {};

        this.ingredients.forEach(function (ingredient) {
            advValues[ingredient.adv] = true;

            var effect = ingredient.effect;
            if (effect && effect.type === "stat") {
                var statKey = effect.stat + ":" + effect.amount;
                statCombos[statKey] = effect;
            } else if (effect && effect.type === "runneth") {
                runnethNames[effect.name] = true;
            }
        });

        var advNumbers = Object.keys(advValues)
            .map(Number)
            .sort(function (a, b) { return a - b; });

        // One option per exact Adv value.
        advNumbers.forEach(function (adv) {
            options.push({
                id: "adv-exact-" + adv,
                label: adv + " Adv"
            });
        });

        // One "X+ Adv" option per unique threshold.
        advNumbers.forEach(function (adv) {
            options.push({
                id: "adv-atleast-" + adv,
                label: adv + "+ Adv"
            });
        });

        // One option per unique stat + amount combination.
        Object.keys(statCombos).sort().forEach(function (key) {
            var effect = statCombos[key];
            options.push({
                id: "stat-" + key,
                label: effect.amount + " " + effect.stat
            });
        });

        // One option per unique Runneth effect name. Labeled with the
        // effect's actual details (same lookup used for the Effect
        // column text) rather than just its name, so the filter list is
        // just as informative as the table itself.
        Object.keys(runnethNames).sort().forEach(function (name) {
            var details = Cup13Parser.RUNNETH_DETAILS[name];
            options.push({
                id: "runneth-" + name,
                label: details || name
            });
        });

        return options;
    };

    // Returns true if the given ingredient matches the given filter id.
    Cup13Model.prototype.ingredientMatchesFilter = function (ingredient, filterId) {
        if (filterId === "all") {
            return true;
        }
        if (filterId === "has-effect") {
            return !!ingredient.effect;
        }
        if (filterId === "no-effect") {
            return !ingredient.effect;
        }
        if (filterId.indexOf("adv-exact-") === 0) {
            var exactValue = Number(filterId.substring("adv-exact-".length));
            return ingredient.adv === exactValue;
        }
        if (filterId.indexOf("adv-atleast-") === 0) {
            var thresholdValue = Number(filterId.substring("adv-atleast-".length));
            return ingredient.adv >= thresholdValue;
        }
        if (filterId.indexOf("stat-") === 0) {
            var statKey = filterId.substring("stat-".length);
            return !!ingredient.effect &&
                ingredient.effect.type === "stat" &&
                (ingredient.effect.stat + ":" + ingredient.effect.amount) === statKey;
        }
        if (filterId.indexOf("runneth-") === 0) {
            var runnethName = filterId.substring("runneth-".length);
            return !!ingredient.effect &&
                ingredient.effect.type === "runneth" &&
                ingredient.effect.name === runnethName;
        }
        return true;
    };

    // --- Search matching -------------------------------------------------

    Cup13Model.prototype.ingredientMatchesSearch = function (ingredient, query) {
        if (!query) {
            return true;
        }

        var needle = query.toLowerCase();

        if (ingredient.name.toLowerCase().indexOf(needle) !== -1) {
            return true;
        }
        if (ingredient.effect && ingredient.effect.text.toLowerCase().indexOf(needle) !== -1) {
            return true;
        }
        if (String(ingredient.adv).indexOf(needle) !== -1) {
            return true;
        }
        if (String(ingredient.quantity).indexOf(needle) !== -1) {
            return true;
        }

        return false;
    };

    // --- Combined query ----------------------------------------------------

    // Returns the ingredients that should currently be displayed:
    // filtered by search + filter, then sorted with favorites always on
    // top, followed by the active sort field/direction.
    Cup13Model.prototype.getVisibleIngredients = function () {
        var self = this;
        var filterId = this.getFilter();
        var search = this.getSearch();

        var visible = this.ingredients.filter(function (ingredient) {
            return self.ingredientMatchesFilter(ingredient, filterId) &&
                self.ingredientMatchesSearch(ingredient, search);
        });

        var sort = this.getSort();
        var direction = sort.direction === "desc" ? -1 : 1;
        var field = sort.field;

        visible.sort(function (a, b) {
            var favA = self.isFavorite(a.value) ? 0 : 1;
            var favB = self.isFavorite(b.value) ? 0 : 1;
            if (favA !== favB) {
                return favA - favB;
            }

            var valueA = self.getSortValue(a, field);
            var valueB = self.getSortValue(b, field);

            if (valueA < valueB) {
                return -1 * direction;
            }
            if (valueA > valueB) {
                return 1 * direction;
            }
            return 0;
        });

        return visible;
    };

    Cup13Model.prototype.getSortValue = function (ingredient, field) {
        if (field === "name") {
            return ingredient.name.toLowerCase();
        }
        if (field === "quantity") {
            return ingredient.quantity;
        }
        if (field === "adv") {
            return ingredient.adv;
        }
        if (field === "effect") {
            return ingredient.effect ? ingredient.effect.text.toLowerCase() : "";
        }
        return "";
    };

    Cup13.Model = Cup13Model;

    // ------------------------------------------------------------------
    // Cup13App
    //
    // Orchestrates parsing the original <select> elements, building the
    // model, and (once cup13.ui.js is loaded) rendering the Tabulator UI.
    // The original <select> elements are left in the DOM and kept in
    // sync - Cup13App never removes them.
    // ------------------------------------------------------------------

    function Cup13App() {
        this.parser = new Cup13Parser();
        this.storage = new Cup13Storage("cup13.settings");
        this.model = null;
        this.selects = null;
        this.initialized = false;
    }

    Cup13App.SELECT_IDS = ["whichitem1", "whichitem2", "whichitem3"];

    // Finds the three original <select> elements by name attribute
    // (whichitem1/2/3), since the page doesn't give them ids.
    Cup13App.prototype.findSelects = function () {
        var selects = {};
        for (var i = 0; i < Cup13App.SELECT_IDS.length; i++) {
            var slotNumber = i + 1;
            var name = "whichitem" + slotNumber;
            var element = document.getElementsByName(name)[0];
            if (element) {
                selects[slotNumber] = element;
            }
        }
        return selects;
    };

    // Sets up the model from the first available select's ingredient
    // list. All three selects contain the same ingredient list, so we
    // only need to parse one of them.
    Cup13App.prototype.buildModel = function () {
        var firstSlotKey = Object.keys(this.selects)[0];
        var firstSelect = this.selects[firstSlotKey];
        var ingredients = this.parser.parseSelect(firstSelect);
        this.model = new Cup13Model(ingredients, this.storage);
    };

    // Public entry point. Safe to call multiple times - subsequent calls
    // are no-ops unless destroy() was called first.
    Cup13App.prototype.init = function () {
        if (this.initialized) {
            return;
        }

        this.selects = this.findSelects();

        if (Object.keys(this.selects).length === 0) {
            // Not on the Cup of 13s page - nothing to do.
            return;
        }

        this.buildModel();

        if (Cup13.UI) {
            this.ui = new Cup13.UI(this.model, this.selects);
            this.ui.render();
        }

        this.initialized = true;
    };

    // Re-parses the original selects and rebuilds the visible ingredient
    // list. Useful if the underlying page data changes without a full
    // reload (not currently expected to happen, but kept as a documented
    // escape hatch).
    Cup13App.prototype.refresh = function () {
        if (!this.initialized) {
            return;
        }

        this.buildModel();

        if (this.ui) {
            this.ui.setModel(this.model);
            this.ui.render();
        }
    };

    // Tears down the Tabulator UI and any event listeners it registered.
    // The original <select> elements are left untouched.
    Cup13App.prototype.destroy = function () {
        if (this.ui) {
            this.ui.destroy();
            this.ui = null;
        }
        this.initialized = false;
    };

    Cup13.App = Cup13App;

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    var appInstance = new Cup13App();

    // The whichitem1/2/3 <select> elements are lazy-populated by the
    // game's own page script after our injected <script> tag has
    // already run (it sits right before </body> and executes during
    // parsing, before the selects get their <option>s). So instead of
    // building the model straight away, poll until at least one select
    // actually has options, then run the real init. This works no
    // matter what mechanism the page uses to fill them in (deferred
    // script, AJAX, etc.) since we're checking the actual DOM state
    // rather than guessing at a load event.
    var SELECTS_POLL_INTERVAL_MS = 100;
    var SELECTS_POLL_TIMEOUT_MS = 10000;

    function selectsArePopulated() {
        for (var i = 0; i < Cup13App.SELECT_IDS.length; i++) {
            var element = document.getElementsByName(Cup13App.SELECT_IDS[i])[0];
            if (element && element.options && element.options.length > 0) {
                return true;
            }
        }
        return false;
    }

    function waitForSelects(callback) {
        var elapsedMs = 0;

        (function poll() {
            if (selectsArePopulated()) {
                callback();
                return;
            }

            elapsedMs += SELECTS_POLL_INTERVAL_MS;
            if (elapsedMs >= SELECTS_POLL_TIMEOUT_MS) {
                // Give up waiting rather than hang forever. init() will
                // just find empty/no selects and no-op, same as it
                // always has on pages where Cup13 doesn't apply.
                callback();
                return;
            }

            setTimeout(poll, SELECTS_POLL_INTERVAL_MS);
        })();
    }

    Cup13.init = function () {
        waitForSelects(function () {
            appInstance.init();
        });
    };

    Cup13.refresh = function () {
        appInstance.refresh();
    };

    Cup13.destroy = function () {
        appInstance.destroy();
    };

})(Cup13);
