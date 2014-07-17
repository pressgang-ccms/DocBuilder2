'use strict';

/**
 * Typo is a JavaScript implementation of a spellchecker using hunspell-style
 * dictionaries.
 */

/**
 * Typo constructor.
 *
 * @param {String} [dictionary] The locale code of the dictionary being used. e.g.,
 *                              "en_US". This is only used to auto-load dictionaries.
 * @param {String} [affData] The data from the dictionary's .aff file. If omitted
 *                           and the first argument is supplied, in "chrome" platform,
 *                           the .aff file will be loaded automatically from
 *                           lib/typo/dictionaries/[dictionary]/[dictionary].aff
 *                           In other platform, it will be loaded from
 *                           [setting.path]/dictionaries/[dictionary]/[dictionary].aff
 * @param {String} [wordsData] The data from the dictionary's .dic file. If omitted,
 *                           and the first argument is supplied, in "chrome" platform,
 *                           the .dic file will be loaded automatically from
 *                           lib/typo/dictionaries/[dictionary]/[dictionary].dic
 *                           In other platform, it will be loaded from
 *                           [setting.path]/dictionaries/[dictionary]/[dictionary].dic
 * @param {Object} [settings] Constructor settings. Available properties are:
 *                            {String} [platform]: "chrome" for Chrome Extension or other
 *                              value for the usual web.
 *                            {String} [path]: path to load dictionary from in non-chrome
 *                              environment.
 *                            {Object} [flags]: flag information.
 *
 *
 * @returns {Typo} A Typo object.
 */

var Typo = function (dictionary, affData, wordsData, settings) {
	settings = settings || {};

	/** Determines the method used for auto-loading .aff and .dic files. **/
	this.platform = settings.platform || "chrome";

	this.dictionary = null;

	this.rules = {};
	this.dictionaryTable = {};

	this.compoundRules = [];
	this.compoundRuleCodes = {};

	this.replacementTable = [];

	this.flags = settings.flags || {};

	if (dictionary) {
		this.dictionary = dictionary;

		if (this.platform == "chrome") {
			if (!affData) affData = this._readFile(chrome.extension.getURL("lib/typo/dictionaries/" + dictionary + "/" + dictionary + ".aff"));
			if (!wordsData) wordsData = this._readFile(chrome.extension.getURL("lib/typo/dictionaries/" + dictionary + "/" + dictionary + ".dic"));
		} else {
			var path = settings.dictionaryPath || '';

			if (!affData) affData = this._readFile(path + "/" + dictionary + "/" + dictionary + ".aff");
			if (!wordsData) wordsData = this._readFile(path + "/" + dictionary + "/" + dictionary + ".dic");
		}

		this.rules = this._parseAFF(affData);

		// Save the rule codes that are used in compound rules.
		this.compoundRuleCodes = {};

		for (var i = 0, _len = this.compoundRules.length; i < _len; i++) {
			var rule = this.compoundRules[i];

			for (var j = 0, _jlen = rule.length; j < _jlen; j++) {
				this.compoundRuleCodes[rule[j]] = [];
			}
		}

		// If we add this ONLYINCOMPOUND flag to this.compoundRuleCodes, then _parseDIC
		// will do the work of saving the list of words that are compound-only.
		if ("ONLYINCOMPOUND" in this.flags) {
			this.compoundRuleCodes[this.flags.ONLYINCOMPOUND] = [];
		}

		this.dictionaryTable = this._parseDIC(wordsData);

		// Get rid of any codes from the compound rule codes that are never used
		// (or that were special regex characters).  Not especially necessary...
		for (var i in this.compoundRuleCodes) {
			if (this.compoundRuleCodes[i].length == 0) {
				delete this.compoundRuleCodes[i];
			}
		}

		// Build the full regular expressions for each compound rule.
		// I have a feeling (but no confirmation yet) that this method of
		// testing for compound words is probably slow.
		for (var i = 0, _len = this.compoundRules.length; i < _len; i++) {
			var ruleText = this.compoundRules[i];

			var expressionText = "";

			for (var j = 0, _jlen = ruleText.length; j < _jlen; j++) {
				var character = ruleText[j];

				if (character in this.compoundRuleCodes) {
					expressionText += "(" + this.compoundRuleCodes[character].join("|") + ")";
				}
				else {
					expressionText += character;
				}
			}

			this.compoundRules[i] = new RegExp(expressionText, "i");
		}
	}

	return this;
};

Typo.prototype = typoPrototype;