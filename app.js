var fs = require('fs');
var set = require('collections/sorted-set.js');
var iterator = require("collections/iterator");
var $ = require("jquery");
var moment = require('moment');
var exec = require('child_process').exec;

/**
 * The REST server that the DocBuilder will connect to.
 * @type {string}
 */
var REST_SERVER = "http://topicindex-dev.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest";
/**
 * The file that holds the lat time a complete rebuild was completed.
 * @type {string}
 */
//var LAST_RUN_FILE = "/home/pressgang/.docbuilder/docbuilder2_lastrun";
var LAST_RUN_FILE = "/home/matthew/.docbuilder/docbuilder2_lastrun";
/**
 * The format of the date to be supplied to the REST query.
 * @type {string}
 */
var DATE_FORMAT = "YYYY-MM-ddThh:mm:ss.000Z";
/**
 * Thje maximum number of child processes to run at any given time.
 * @type {number}
 */
var MAX_PROCESSES = 16;

/**
 * true when the modified topics have been processed.
 * @type {boolean}
 */
var topicsProcessed = false;
/**
 * true when the modified specs have been processed
 * @type {boolean}
 */
var specsProcessed = false;
/**
 * The count of the number of child processes
 * @type {number}
 */
var childCount = 0;
/**
 * The string to be saved in the marker file when a rebuild is completed.
 * @type {string}
 */
var thisBuildTime = null;

/**
 * Called when the modified topics and specs have been found. Once both
 * functions have called this function, the process of actually building the
 * books will start.
 */
function buildBooks(updatedSpecs) {
	if (specsProcessed && topicsProcessed) {

		for (var processIndex = 0, processCount = updatedSpecs.length < MAX_PROCESSES ? updatedSpecs.length : MAX_PROCESSES; processIndex < processCount; ++processIndex) {
			var specId = updatedSpecs.pop();
			++childCount;
			exec("echo " + specId, function(error, stdout, stderr) {
				--childCount;
				if (childCount < MAX_PROCESSES) {

					if (updatedSpecs.length != 0) {
						/*
						 	If there are still specs to be processed, then process them
						 */
						buildBooks(updatedSpecs);
					} else if (childCount == 0) {
						/*
						  	Otherwise, wait until the last child process has finished, and
						  	restart the build.
						 */
						getListOfSpecsToBuild();
					}
				}
			});
		}

	}
}


/**
 * Query the server for all topics that have been modified since the specified time
 * @param lastRun The time DocBuilder was last run
 */
function getModifiedTopics(lastRun, updatedSpecs) {
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
			buildBooks(updatedSpecs);
		});
}

/**
 * Query the server for all specs that have been modified since the specified time
 * @param lastRun The time DocBuilder was last run
 */
function getModifiedSpecs(lastRun, updatedSpecs) {
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
			buildBooks(updatedSpecs);
		});
}

/**
 * Reads a file that holds the time DocBuilder last did a build, and then
 * finds the modified specs and topics.
 */
function getListOfSpecsToBuild() {
	if (thisBuildTime != null) {
		fs.writeFileSync(LAST_RUN_FILE, thisBuildTime);
		thisBuildTime = moment().format(DATE_FORMAT);
	}

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

	/*
		Reset the variables for this run.
	 */
	topicsProcessed = false;
	specsProcessed = false;
	var updatedSpecs = new set([]);

	getModifiedTopics(lastRun, updatedSpecs);
	getModifiedSpecs(lastRun, updatedSpecs);
}

getListOfSpecsToBuild();

