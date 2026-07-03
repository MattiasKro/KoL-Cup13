/*
 * Cup13 - UI layer.
 *
 * File: cup13.ui.js
 * Contains: Cup13UI
 *
 * Responsible for everything DOM/Tabulator-related. Cup13UI never
 * touches localStorage or does its own sorting/filtering logic - all of
 * that lives in Cup13Model. This file only renders what the model says
 * to render, and forwards user actions (search, filter, sort clicks,
 * favorite clicks, row double-clicks) back into the model.
 */

var Cup13 = Cup13 || {};

(function (Cup13) {
    "use strict";

    var SORTABLE_COLUMNS = [
        { field: "favorite", label: "\u2605" },
        { field: "name", label: "Name" },
        { field: "quantity", label: "Qty" },
        { field: "adv", label: "Adv" },
        { field: "effect", label: "Effect" }
    ];

    // Discrete background colors for the Effect cell only. Chosen to be
    // easy to tell apart at a glance, not to match any particular KoL
    // color scheme - adjust freely.
    var EFFECT_COLORS = {
        "Muscle": "#f2d9b8",
        "Mysticality": "#c9d9f2",
        "Moxie": "#d9f2d0",
        "Runneth Cold": "#cdeaf5",
        "Runneth Wild": "#e0d3f2",
        "Runneth Over": "#f5dccd",
        "Runneth On Empty": "#e8e8e8",
        "Runneth On Fumes": "#f0e6c8",
        "Runneth a Fever": "#f5cdd3",
        "Runneth a Tight Ship": "#cde3f5",
        "Runneth For Thy Life": "#f5cdc9",
        "Runneth With The Pack": "#dcead0",
        "Runneth Into Thine Ex": "#f0cde0"
    };

    var DEFAULT_EFFECT_COLOR = "#eeeeee";
    var UNKNOWN_EFFECT_COLOR = "#f5eecd";

    function Cup13UI(model, selects) {
        this.model = model;
        this.selects = selects;
        this.container = null;
        this.table = null;
        this.searchInput = null;
        this.filterSelect = null;
        this.slotRadios = {};
        this.slotLabels = {};
    }

    Cup13UI.prototype.setModel = function (model) {
        this.model = model;
    };

    // ------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------

    // Builds the whole UI and inserts it right after the third original
    // <select>. Safe to call again after destroy().
    Cup13UI.prototype.render = function () {
        if (this.container) {
            this.destroy();
        }

        this.container = document.createElement("div");
        this.container.className = "cup13-container";

        this.container.appendChild(this.buildSearchRow());
        this.container.appendChild(this.buildFilterRow());
        this.container.appendChild(this.buildSlotSection());
        this.container.appendChild(this.buildTableContainer());

        this.insertContainer();
        this.buildTable();
    };

    // Places the UI container directly after the last original <select>
    // (whichitem3), so it appears in a sensible spot on the page without
    // disturbing the original form layout.
    Cup13UI.prototype.insertContainer = function () {
        var lastSelect = this.selects[3] || this.selects[2] || this.selects[1];
        if (lastSelect && lastSelect.parentNode) {
            lastSelect.parentNode.insertBefore(
                this.container,
                lastSelect.nextSibling
            );
        } else {
            document.body.appendChild(this.container);
        }
    };

    Cup13UI.prototype.buildSearchRow = function () {
        var row = document.createElement("div");
        row.className = "cup13-row cup13-search-row";

        var label = document.createElement("label");
        label.textContent = "Search: ";

        var input = document.createElement("input");
        input.type = "text";
        input.className = "cup13-search-input";
        input.value = this.model.getSearch();

        var self = this;
        input.addEventListener("input", function () {
            self.model.setSearch(input.value);
            self.refreshTableData();
        });

        this.searchInput = input;

        label.appendChild(input);
        row.appendChild(label);
        return row;
    };

    Cup13UI.prototype.buildFilterRow = function () {
        var row = document.createElement("div");
        row.className = "cup13-row cup13-filter-row";

        var label = document.createElement("label");
        label.textContent = "Filter: ";

        var select = document.createElement("select");
        select.className = "cup13-filter-select";

        var options = this.model.buildFilterOptions();
        var currentFilter = this.model.getFilter();

        options.forEach(function (option) {
            var optionElement = document.createElement("option");
            optionElement.value = option.id;
            optionElement.textContent = option.label;
            if (option.id === currentFilter) {
                optionElement.selected = true;
            }
            select.appendChild(optionElement);
        });

        var self = this;
        select.addEventListener("change", function () {
            self.model.setFilter(select.value);
            self.refreshTableData();
        });

        this.filterSelect = select;

        label.appendChild(select);
        row.appendChild(label);
        return row;
    };

    Cup13UI.prototype.buildSlotSection = function () {
        var section = document.createElement("div");
        section.className = "cup13-slot-section";

        var heading = document.createElement("div");
        heading.className = "cup13-slot-heading";
        heading.textContent = "Editing:";
        section.appendChild(heading);

        var activeSlot = this.model.getActiveSlot();

        [1, 2, 3].forEach(function (slotNumber) {
            var row = this.buildSlotRow(slotNumber, activeSlot);
            section.appendChild(row);
        }, this);

        return section;
    };

    Cup13UI.prototype.buildSlotRow = function (slotNumber, activeSlot) {
        var row = document.createElement("div");
        row.className = "cup13-slot-row";

        var radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "cup13-active-slot";
        radio.value = String(slotNumber);
        radio.checked = (slotNumber === activeSlot);
        radio.id = "cup13-slot-radio-" + slotNumber;

        var self = this;
        radio.addEventListener("change", function () {
            self.model.setActiveSlot(slotNumber);
        });

        var label = document.createElement("label");
        label.setAttribute("for", radio.id);
        label.className = "cup13-slot-label";
        label.textContent = " Slot " + slotNumber + ": " + this.getSlotItemName(slotNumber);

        this.slotRadios[slotNumber] = radio;
        this.slotLabels[slotNumber] = label;

        row.appendChild(radio);
        row.appendChild(label);
        return row;
    };

    // Looks up the currently selected option in the original <select>
    // for a given slot and returns its parsed ingredient name, or "-"
    // if nothing matches (should not normally happen).
    Cup13UI.prototype.getSlotItemName = function (slotNumber) {
        var select = this.selects[slotNumber];
        if (!select) {
            return "\u2014";
        }

        var selectedOption = select.options[select.selectedIndex];
        if (!selectedOption) {
            return "\u2014";
        }

        var ingredient = this.findIngredientByValue(selectedOption.value);
        return ingredient ? ingredient.name : "\u2014";
    };

    Cup13UI.prototype.findIngredientByValue = function (value) {
        var ingredients = this.model.ingredients;
        for (var i = 0; i < ingredients.length; i++) {
            if (ingredients[i].value === value) {
                return ingredients[i];
            }
        }
        return null;
    };

    // Updates only the three slot labels, without rebuilding the rest of
    // the UI. Called after a double-click selects a new item.
    Cup13UI.prototype.updateSlotLabels = function () {
        [1, 2, 3].forEach(function (slotNumber) {
            var label = this.slotLabels[slotNumber];
            if (label) {
                label.textContent = " Slot " + slotNumber + ": " + this.getSlotItemName(slotNumber);
            }
        }, this);
    };

    Cup13UI.prototype.buildTableContainer = function () {
        var tableDiv = document.createElement("div");
        tableDiv.className = "cup13-table";
        this.tableElement = tableDiv;
        return tableDiv;
    };

    // ------------------------------------------------------------------
    // Tabulator wiring
    // ------------------------------------------------------------------

    Cup13UI.prototype.buildTable = function () {
        var self = this;

        var columns = [
            {
                title: "\u2605",
                field: "favorite",
                headerSort: false,
                width: 40,
                hozAlign: "center",
                formatter: function (cell) {
                    var ingredient = cell.getRow().getData();
                    return self.model.isFavorite(ingredient.value) ? "\u2605" : "\u2606";
                },
                cellClick: function (e, cell) {
                    var ingredient = cell.getRow().getData();
                    self.model.toggleFavorite(ingredient.value);
                    self.refreshTableData();
                }
            },
            {
                title: this.columnTitle("name", "Name"),
                field: "name",
                headerSort: false,
                headerClick: function () { self.handleSortClick("name"); }
            },
            {
                title: this.columnTitle("quantity", "Qty"),
                field: "quantity",
                headerSort: false,
                width: 90,
                hozAlign: "right",
                headerClick: function () { self.handleSortClick("quantity"); }
            },
            {
                title: this.columnTitle("adv", "Adv"),
                field: "adv",
                headerSort: false,
                width: 80,
                hozAlign: "right",
                headerClick: function () { self.handleSortClick("adv"); }
            },
            {
                title: this.columnTitle("effect", "Effect"),
                field: "effect",
                headerSort: false,
                headerClick: function () { self.handleSortClick("effect"); },
                formatter: function (cell) {
                    var ingredient = cell.getRow().getData();
                    return ingredient.effect ? ingredient.effect.text : "\u2014";
                },
                cellClick: false
            }
        ];

        this.table = new Tabulator(this.tableElement, {
            data: this.model.getVisibleIngredients(),
            columns: columns,
            layout: "fitColumns",
            height: "400px",
            rowFormatter: function (row) {
                var cells = row.getCells();
                cells.forEach(function (cell) {
                    if (cell.getField() === "effect") {
                        self.colorEffectCell(cell);
                    }
                });
            }
        });

        this.table.on("rowDblClick", function (e, row) {
            self.selectIngredientForActiveSlot(row.getData());
        });
    };

    // Adds a small arrow to the header of whichever column is currently
    // the active sort field, so the user can see what's sorted and in
    // which direction.
    Cup13UI.prototype.columnTitle = function (field, label) {
        var sort = this.model.getSort();
        if (sort.field !== field) {
            return label;
        }
        var arrow = sort.direction === "desc" ? " \u2193" : " \u2191";
        return label + arrow;
    };

    Cup13UI.prototype.handleSortClick = function (field) {
        this.model.setSort(field);
        this.rebuildColumnTitles();
        this.refreshTableData();
    };

    // Tabulator doesn't cleanly support updating just a column title, so
    // we rebuild the column definitions with fresh titles and reapply
    // them. Sort state itself lives in the model, not in Tabulator.
    Cup13UI.prototype.rebuildColumnTitles = function () {
        var self = this;
        var columns = this.table.getColumnDefinitions();
        columns.forEach(function (column) {
            if (column.field === "favorite") {
                return;
            }
            var label = SORTABLE_COLUMNS.filter(function (c) {
                return c.field === column.field;
            })[0];
            if (label) {
                column.title = self.columnTitle(column.field, label.label);
            }
        });
        this.table.setColumns(columns);
    };

    Cup13UI.prototype.colorEffectCell = function (cell) {
        var ingredient = cell.getRow().getData();
        var element = cell.getElement();

        if (!ingredient.effect) {
            element.style.backgroundColor = "";
            return;
        }

        var effect = ingredient.effect;
        var colorKey = effect.type === "stat" ? effect.stat : effect.name;
        var color = EFFECT_COLORS[colorKey];

        if (!color) {
            color = effect.type === "unknown" ? UNKNOWN_EFFECT_COLOR : DEFAULT_EFFECT_COLOR;
        }

        element.style.backgroundColor = color;
    };

    // Re-pulls the visible ingredient list from the model and pushes it
    // into Tabulator, without rebuilding the whole table.
    Cup13UI.prototype.refreshTableData = function () {
        if (this.table) {
            this.table.replaceData(this.model.getVisibleIngredients());
        }
    };

    // ------------------------------------------------------------------
    // Selecting an item for the active slot
    // ------------------------------------------------------------------

    // Sets the original <select> for the currently active slot to the
    // given ingredient's option, then dispatches a native "change" event
    // so the page's own cup13RecalcAdvs() (and any other listeners) run
    // exactly as if the user had picked it from the dropdown by hand.
    Cup13UI.prototype.selectIngredientForActiveSlot = function (ingredient) {
        var slotNumber = this.model.getActiveSlot();
        var select = this.selects[slotNumber];
        if (!select) {
            return;
        }

        var optionIndex = this.findOptionIndexByValue(select, ingredient.value);
        if (optionIndex === -1) {
            return;
        }

        select.selectedIndex = optionIndex;

        var changeEvent;
        if (typeof Event === "function") {
            changeEvent = new Event("change", { bubbles: true });
        } else {
            changeEvent = document.createEvent("HTMLEvents");
            changeEvent.initEvent("change", true, false);
        }
        select.dispatchEvent(changeEvent);

        this.updateSlotLabels();
    };

    Cup13UI.prototype.findOptionIndexByValue = function (select, value) {
        var options = select.options;
        for (var i = 0; i < options.length; i++) {
            if (options[i].value === value) {
                return i;
            }
        }
        return -1;
    };

    // ------------------------------------------------------------------
    // Teardown
    // ------------------------------------------------------------------

    Cup13UI.prototype.destroy = function () {
        if (this.table) {
            this.table.destroy();
            this.table = null;
        }
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.container = null;
        this.searchInput = null;
        this.filterSelect = null;
        this.slotRadios = {};
        this.slotLabels = {};
    };

    Cup13.UI = Cup13UI;

})(Cup13);
