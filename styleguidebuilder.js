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

var STYLE_GUIDE_SPEC_ID = 22516;

// get all topics with the valid word extended property

var customDicUrl = REST_SERVER + "/1/topics/get/json/query;;propertyTagExists" + VALID_WORD_EXTENDED_PROPERTY_TAG_ID + "=true?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%22topics%22%2C%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A+%22properties%22%7D%7D%5D%7D%5D%7D";

$.getJSON(customDicUrl, function(topics) {

    var lastLetter = null;

    var contentSpec = 'ID = ' + STYLE_GUIDE_SPEC_ID + '\n\
Title = ECS Custom Dictionary\n\
Product = PressGang\n\
Version = 1.3\n\
Copyright Holder = Red Hat\n\
\n\
Chapter: Dictionary\n';

    topics.items.sort(function(a, b) {return a.item.title.toLowerCase() > b.item.title.toLowerCase()});

    for (var topicIndex = 0, topicCount = topics.items.length; topicIndex < topicCount; ++topicIndex) {
        var topic =  topics.items[topicIndex].item;
        var firstLetter = topic.title.substring(0, 1).toUpperCase();
        if (firstLetter != lastLetter) {
            lastLetter = firstLetter;
            contentSpec += "Chapter: " + firstLetter + "\n";
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