/*
 Copyright 2011-2014 Red Hat, Inc

 This file is part of PressGang CCMS.

 PressGang CCMS is free software: you can redistribute it and/or modify
 it under the terms of the GNU Lesser General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 PressGang CCMS is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Lesser General Public License for more details.

 You should have received a copy of the GNU Lesser General Public License
 along with PressGang CCMS.  If not, see <http://www.gnu.org/licenses/>.
 */


var deployment = require("./deployment_details.js");
var $ = require("jquery");

/**
 * The REST server that the DocBuilder will connect to.
 * @type {string}
 */
var REST_SERVER = "http://" + deployment.BASE_SERVER + "/pressgang-ccms/rest";

/**
 * The id of the extended property that defines valid dictionary words
 * @type {number}
 */
var VALID_WORD_EXTENDED_PROPERTY_TAG_ID = 33;
/**
 * The id of the extended property that defines invalid dictionary words
 * @type {number}
 */
var INVALID_WORD_EXTENDED_PROPERTY_TAG_ID = 32;
/**
 * The id of the extended property that defines discourages dictionary words
 * @type {number}
 */
var DISCOURAGED_WORD_EXTENDED_PROPERTY_TAG_ID = 31;
/**
 * The id of the extended property that defines discourages dictionary phrases
 * @type {number}
 */
var DISCOURAGED_PHRASE_EXTENDED_PROPERTY_TAG_ID = 33;

var STYLE_GUIDE_SPEC_ID = 22516;

// get all topics with the valid word extended property

var customDicUrl = REST_SERVER + "/1/topics/get/json/query;propertyTagExists" + VALID_WORD_EXTENDED_PROPERTY_TAG_ID + "=true;propertyTagExists" + INVALID_WORD_EXTENDED_PROPERTY_TAG_ID + "=true;propertyTagExists" + DISCOURAGED_WORD_EXTENDED_PROPERTY_TAG_ID + "=true;propertyTagExists" + DISCOURAGED_PHRASE_EXTENDED_PROPERTY_TAG_ID + "=true;logic=Or?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%22topics%22%2C%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22properties%22%7D%7D%5D%7D%5D%7D";

$.getJSON(customDicUrl, function(topics) {

    var lastLetter = null;

    var contentSpec = 'ID = ' + STYLE_GUIDE_SPEC_ID + '\n\
Title = ECS Custom Dictionary\n\
Product = PressGang\n\
Version = 1.3\n\
Copyright Holder = Red Hat\n\
BZProduct = PressGang CCMS\n\
BZComponent = Documentation\n';

    topics.items.sort(function(a, b) {
        if (a.item.title.toLowerCase() > b.item.title.toLowerCase()) {
            return 1;
        }

        if (a.item.title.toLowerCase() == b.item.title.toLowerCase()) {
            return 0;
        }

        return -1;
    });

    for (var topicIndex = 0, topicCount = topics.items.length; topicIndex < topicCount; ++topicIndex) {
        var topic =  topics.items[topicIndex].item;
        var firstLetter = topic.title.substring(0, 1).toUpperCase();
        if (firstLetter != lastLetter) {
            lastLetter = firstLetter;
            contentSpec += "\nChapter: " + firstLetter + "\n";
        }

        contentSpec += "  " + topic.title + " [" + topic.id + "]\n";
    }

    var currentSpecUrl = REST_SERVER + "/1/contentspec/get/json+text/" + STYLE_GUIDE_SPEC_ID + "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22text%22%7D%7D%5D%7D";

    $.getJSON(currentSpecUrl, function(existingSpec){
        if (existingSpec.text != contentSpec) {
            var updateUrl = REST_SERVER + "/1/contentspec/update/json+text?message=docbuilder%3A+Automatically+updated+spec&flag=1&userId=89";
            var fixedContentSpec = contentSpec.replace(/\n/g, "\\n");
            var postBody = '{"text":"' + fixedContentSpec + '", "id":' + STYLE_GUIDE_SPEC_ID + ', "configuredParameters":["text"]}';

            $.ajax({
                type: "POST",
                contentType: "application/json",
                url: updateUrl,
                data: postBody,
                success: function(updatedSpec) {

                },
                dataType: "json"
            });
        }
    });
});