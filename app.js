var fs = require('fs');
var set = require('collections/sorted-set.js');
var iterator = require("collections/iterator");
var $ = require("jquery");
var moment = require('moment');

/**
 * The REST server that the DocBuilder will connect to
 * @type {string}
 */
var REST_SERVER = "http://topicindex-dev.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest";
//var LAST_RUN_FILE = "/home/pressgang/.docbuilder/docbuilder2_lastrun";
var LAST_RUN_FILE = "/home/matthew/.docbuilder/docbuilder2_lastrun";
var DATE_FORMAT = "YYYY-MM-ddThh:mm:ss.000Z";

var topicsProcessed = false;
var specsProcessed = false;
var updatedSpecs = new set([]);

function buildBooks() {
	if (specsProcessed && topicsProcessed) {
		console.log(updatedSpecs.toArray());
		fs.readFileSync(LAST_RUN_FILE, moment().format(DATE_FORMAT));
	}
}

function getModifiedTopics(lastRun) {
	var topicQuery = REST_SERVER + "/1/topics/get/json/query;";

	// If we have some last run info, use that to limit the search
	if (lastRun != null) {
		topicQuery += "startEditDate=" + encodeURIComponent(encodeURIComponent(lastRun));
	}
	topicQuery += "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22topics%22%7D%2C%20%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs_OTM%22%7D%7D%5D%7D%5D%7D%0A%0A";

	$.getJSON(topicQuery,
		function(data) {
			if (data.items) {
				for (var topicIndex = 0, topicCount = data.items.length; topicIndex < topicCount; ++topicIndex) {
					var topic = data.items[topicIndex].item;
					if (topic.contentSpecs_OTM) {
						for (var specIndex = 0, specCount = topic.contentSpecs_OTM.items.length; specIndex < specCount; ++specIndex) {
							var spec = topic.contentSpecs_OTM.items[specIndex].item;
							updatedSpecs.add(spec.id);
						}
					} else {
						console.log("topic.contentSpecs_OTM was not expected to be null");
					}
				}
			} else {
				console.log("data.items was not expected to be null");
			}

			topicsProcessed = true;
			buildBooks();
		});
}

function getModifiedSpecs(lastRun) {
	var topicQuery = REST_SERVER + "/1/contentspecs/get/json/query;";

	// If we have some last run info, use that to limit the search
	if (lastRun != null) {
		topicQuery += "startEditDate=" + encodeURIComponent(encodeURIComponent(lastRun));
	}
	topicQuery += "?expand=%7B%22branches%22%3A%5B%7B%22trunk%22%3A%7B%22name%22%3A%20%22contentSpecs%22%7D%7D%5D%7D";

	$.getJSON(topicQuery,
		function(data) {
			if (data.items) {
				for (var specIndex = 0, specCount = data.items.length; specIndex < specCount; ++specIndex) {
					var spec = data.items[specIndex].item;
					updatedSpecs.add(spec.id);
				}
			} else {
				console.log("data.items was not expected to be null");
			}

			specsProcessed = true;
			buildBooks();
		});
}

function getListOfSpecsToBuild() {
	var lastRun = null;

	// See if the last run file exists
	try {
		stats = fs.lstatSync(LAST_RUN_FILE);
		if (stats.isFile()) {
			lastRun = fs.readFileSync(LAST_RUN_FILE).toString().replace(/\n/g, "");
		}
	} catch (ex) {
		// the file or directory doesn't exist. leave lastRun as null.
	}

	getModifiedTopics(lastRun);
	getModifiedSpecs(lastRun);
}

getListOfSpecsToBuild();

