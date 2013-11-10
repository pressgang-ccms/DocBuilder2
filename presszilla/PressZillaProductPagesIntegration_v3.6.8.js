(function(){

    if (isDocbuilderWindow() && unsafeWindow.getSpecIdFromURL) {

        /**
         * The height of each process in the timeline
         * @type {number}
         */
        var PRESSGANG_TIMELINE_ITEM_HEIGHT = 20;

        /**
         * The height of a process in the timeline
         * @type {number}
         */
        var TIMELINE_ITEM_HEIGHT = 23;

        /**
         * The margine above the timeline
         * @type {number}
         */
        var TIMELINE_VERTICAL_OFFSET = 40;

        /**
         * The width of a given date in the timeline
         * @type {number}
         */
        var TIMELINE_ITEM_WIDTH = 100;

        /**
         * The number of times to retry the product pages API
         * @type {number}
         */
        var PRODUCT_PAGES_RETRY = 5;

        /**
         * The maximum height of the timeline graph
         * @type {number}
         */
        var MAX_HEIGHT = 512;

        /**
         * The scale to apply when a path is clicked
         * @type {number}
         */
        var CLICK_SCALE = 1.2;

        function hashCode(s) {
            return s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
        }

        // Edited from http://raphaeljs.com/github/impact-code.js
        var process = function (json) {

            // spread processes across all buckets
            for (var i in json.processes) {
                var start, end;

                // look for the last bucket (buckets have to be sorted by date)
                for (var j = json.buckets.length - 1; j >= 0; j--) {
                    var isin = false;
                    for (var k = 0, kk = json.buckets[j].processes.length; k < kk; k++) {
                        isin = isin || (json.buckets[j].processes[k] == i);
                    }
                    if (isin) {
                        end = j;
                        break;
                    }
                }

                // look for the first bucket
                for (var j = 0, jj = json.buckets.length; j < jj; j++) {
                    var isin = false;
                    for (var k = 0, kk = json.buckets[j].processes.length; k < kk; k++) {
                        isin = isin || (json.buckets[j].processes[k] == i);
                    };
                    if (isin) {
                        start = j;
                        break;
                    }
                }

                // add the author to every bucket inbetween if not already present
                for (var j = start, jj = end; j < jj; j++) {
                    var isin = false;
                    for (var k = 0, kk = json.buckets[j].processes.length; k < kk; k++) {
                        isin = isin || (json.buckets[j].processes[k] == i);
                    }
                    if (!isin) {
                        json.buckets[j].processes.push(parseInt(i));
                    }

                    json.buckets[j].processes.sort();
                }
            }

            // count the maximum number of processes
            var maxProcesses = 0;
            for (var bucketIndex = 0, bucketCount = json.buckets.length; bucketIndex < bucketCount; ++bucketIndex) {

                var numProcesses = json.buckets[bucketIndex].processes.length;
                if (maxProcesses < numProcesses)  {
                    maxProcesses = numProcesses;
                }
            }

            // allow some extra rows for the date and some padding
            maxProcesses += 1;
            var timelineHeight = (maxProcesses * TIMELINE_ITEM_HEIGHT);
            var timelineDisplayHeight = timelineHeight > MAX_HEIGHT ? MAX_HEIGHT :  timelineHeight;

            var timelineWidth = json.buckets.length * TIMELINE_ITEM_WIDTH;


            // if the main javascript file opens and closes the side menu, it will need this info to keep the body
            // properly positioned.
            unsafeWindow.scheduleHeight = timelineHeight + TIMELINE_VERTICAL_OFFSET;

            // is the menu open?
            var leftSide = 316;
            var rightside = 8;

            var timelineChartDiv = jQuery('<div id="timelineChartDiv" style="position: absolute; top:' + TIMELINE_VERTICAL_OFFSET + 'px; left: ' + leftSide + 'px; right: ' + rightside + 'px; height: ' + timelineDisplayHeight + 'px; overflow: auto;"></div>');

            // hide it if the menu is hidden
            if (jQuery("#openpressgangmenu").css("display") != "none") {
                timelineChartDiv.css("display", "none");
            } else {
                jQuery("body").css("margin-top", (timelineDisplayHeight + TIMELINE_VERTICAL_OFFSET) + "px");
            }

            timelineChartDiv.appendTo(jQuery('#offscreenRendering'));

            // raphael charts need to be drawn in an element attached to the DOM
            setTimeout(function() {

                timelineChartDiv.appendTo(jQuery("body"));

                var x = 0,
                    timelineChart = Raphael("timelineChartDiv", timelineWidth, timelineHeight),
                    labels = {},
                    textattr = {"font": '9px "Arial"', stroke: "none", fill: "#fff"},
                    pathes = {},
                    lgnd2 = jQuery('<div id="pressgangschedulelegend" style="position: absolute; top: 8px; left: ' + leftSide + 'px; width: 24px; height: 24px;"></div>'),
                    usrnm2 = jQuery('<div id="pressgangscheduleprocessname" style="position: absolute; top: 8px; left: ' + (leftSide + 32) + 'px"></div>'),
                    today = jQuery('<button id="productpagestodaybutton" type="button" style="position: absolute; top: 8px; right: ' + rightside + 'px" class="btn btn-default btn-xs">Show Today</button>');

                jQuery("body").append(lgnd2);
                jQuery("body").append(usrnm2);
                jQuery("body").append(today);


                function block() {

                    var p, h;

                    var today = new Date();
                    var todayOnGraph = null;
                    var scrollToToday = null;

                    for (var j = 0, jj = json.buckets.length; j < jj; j++) {
                        var processes = json.buckets[j].processes;
                        h = 0;
                        for (var i = 0, ii = processes.length; i < ii; i++) {
                            p = pathes[processes[i]];
                            if (!p) {
                                p = pathes[processes[i]] = {f:[], b:[]};
                            }
                            // push an array with x (x pos), h (height) and the number of commits
                            p.f.push([x, h]);
                            // add the x (x pos) and a height based on the number of commits to the start of the array
                            p.b.unshift([x, h += PRESSGANG_TIMELINE_ITEM_HEIGHT]);
                            h += 2;
                        }
                        // get date from milliseconds
                        var dt = json.buckets[j].date;
                        var dtext = dt.getDate() + " " + ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][dt.getMonth()] + " " + dt.getFullYear();

                        var textElement = timelineChart.text(x + 25, h + 10, dtext).attr({"font": '9px "Arial"', stroke: "none", fill: "#aaa"});

                        if (dt < today) {
                            scrollToToday = x;
                            todayOnGraph = textElement;
                        }

                        x += 100;
                    }

                    if (scrollToToday) {
                        timelineChartDiv.scrollLeft(scrollToToday - timelineChartDiv.width() / 2);
                        todayOnGraph.attr({fill: "#FF0000"});
                        jQuery('#productpagestodaybutton').click(function(){
                            timelineChartDiv.scrollLeft(scrollToToday - timelineChartDiv.width() / 2);
                        });
                    }

                    var c = 0;
                    for (var i in pathes) {
                        labels[i] = timelineChart.set();

                        var clr = json.processes[i].color;
                        var idSplit = json.processes[i].id.split(".");

                        var path = timelineChart.path().attr({fill: clr, stroke: clr});
                        pathes[i].p = path;

                        pathes[i].p.click(function(clr, element) {
                                return function(event) {
                                    if (element.effect) {
                                        element.effect.stop();
                                        element.effect = null;
                                        element.attr({fill: clr});
                                    } else {
                                        function a() {
                                            element.effect = element.animate({fill : '#FFF'}, 1000, b);
                                        }
                                        function b() {
                                            element.effect = element.animate({fill : clr}, 1000, a);
                                        }
                                        a();
                                    }
                                }
                            } (clr, path)
                        );

                        var path = "M".concat(pathes[i].f[0][0], ",", pathes[i].f[0][1], "L", pathes[i].f[0][0] + 50, ",", pathes[i].f[0][1]);
                        var th = Math.round(pathes[i].f[0][1] + (pathes[i].b[pathes[i].b.length - 1][1] - pathes[i].f[0][1]) / 2 + 3);
                        labels[i].push(timelineChart.text(pathes[i].f[0][0] + 25, th, idSplit[0]).attr(textattr));
                        var X = pathes[i].f[0][0] + 50,
                            Y = pathes[i].f[0][1];
                        for (var j = 1, jj = pathes[i].f.length; j < jj; j++) {
                            path = path.concat("C", X + 20, ",", Y, ",");
                            X = pathes[i].f[j][0];
                            Y = pathes[i].f[j][1];
                            path = path.concat(X - 20, ",", Y, ",", X, ",", Y, "L", X += 50, ",", Y);
                            th = Math.round(Y + (pathes[i].b[pathes[i].b.length - 1 - j][1] - Y) / 2 + 3);
                            if (th - 9 > Y) {
                                //labels[i].push(timelineChart.text(X - 25, th, pathes[i].f[j][2]).attr(textattr));
                                //timelineChart.text(X - 25, th, idSplit[0]).attr(textattr);
                            }
                        }
                        path = path.concat("L", pathes[i].b[0][0] + 50, ",", pathes[i].b[0][1], ",", pathes[i].b[0][0], ",", pathes[i].b[0][1]);
                        for (var j = 1, jj = pathes[i].b.length; j < jj; j++) {
                            path = path.concat("C", pathes[i].b[j][0] + 70, ",", pathes[i].b[j - 1][1], ",", pathes[i].b[j][0] + 70, ",", pathes[i].b[j][1], ",", pathes[i].b[j][0] + 50, ",", pathes[i].b[j][1], "L", pathes[i].b[j][0], ",", pathes[i].b[j][1]);
                        }
                        pathes[i].p.attr({path: path + "z"});
                        //labels[i].hide();
                        var current = null;
                        (function (i, clr) {
                            pathes[i].p.mouseover(function () {
                                if (current != null) {
                                    //labels[current].hide();
                                }
                                current = i;
                                //labels[i].show();
                                pathes[i].p.toFront();
                                labels[i].toFront();
                                usrnm2[0].innerHTML = json.processes[i].name;
                                lgnd2[0].style.backgroundColor = clr;
                            });
                        })(i, clr);
                    }
                }

                block();

            }, 0);


        };

        function getSchedule(id, count) {
            if (count >= PRODUCT_PAGES_RETRY) {
                logToConsole("Product Pages REST API failed too many times.");
            } else {

                logToConsole("Getting Schedules");

                var solutionsUrl = "https://pp.engineering.redhat.com/pp/action/explorer/" + id + "/all/cpe,schedule/";

                (function (count) {

                    var retried = false;

                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: solutionsUrl,
                        headers: {Accept: 'application/json'},
                        onabort: function() {logToConsole("onabort"); if (!retried) {retried = true; getSchedule(id, ++count);}},
                        onerror: function() {logToConsole("onerror"); if (!retried) {retried = true; getSchedule(id, ++count);}},
                        ontimeout: function() {logToConsole("ontimeout"); if (!retried) {retried = true; getSchedule(id, ++count);}},
                        onload: function(response) {
                            logToConsole(response);

                            if (response.responseText.length == 0) {
                                if (!retried) {
                                    retried = true;
                                    getSchedule(id, ++count);
                                }
                            } else {

                                var responseJson = JSON.parse(response.responseText);

                                if (responseJson.length != 0) {

                                    var data = {buckets: [], processes: {}};
                                    var maxId = 0;

                                    for (var scheduleGroupIndex = 0, scheduleGroupCount = responseJson.length; scheduleGroupIndex < scheduleGroupCount; ++scheduleGroupIndex) {

                                        for (var scheduleIndex = 0, scheduleCount = responseJson[scheduleGroupIndex].schedule.length; scheduleIndex < scheduleCount; ++scheduleIndex) {
                                            var schedule = responseJson[scheduleGroupIndex].schedule[scheduleIndex];
                                            var scheduleDisplayedName = schedule.name + " (" + schedule.id + ")";
                                            var processId = null;
                                            for (var scheduleDetails in data.processes) {
                                                if (data.processes[scheduleDetails] == scheduleDisplayedName) {
                                                    processId = scheduleDetails;
                                                    break;
                                                }
                                            }

                                            if (!processId) {
                                                processId = maxId;
                                                ++maxId;

                                                var hash = hashCode(scheduleDisplayedName);
                                                var mask = parseInt("11111111", 2);

                                                var red = (hash & mask) / mask;
                                                hash = hash << 2;
                                                var green = (hash & mask) / mask;
                                                hash = hash << 2;
                                                var blue = (hash & mask) / mask;

                                                var clr = Raphael.getRGB("rgb(" + (red * 255) + "," + (green * 255) + "," + (blue * 255) + ")");

                                                data.processes[processId] = {name: scheduleDisplayedName, id: schedule.id, color: clr};
                                            }

                                            var startDate = new Date(schedule.start.actual.timet * 1000);
                                            var fixedStartDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                                            var startBucket = null;

                                            for (var bucketIndex = 0, bucketCount = data.buckets.length; bucketIndex < bucketCount; ++bucketIndex) {
                                                var bucket = data.buckets[bucketIndex];
                                                if (bucket.date.getTime() == fixedStartDate.getTime()) {
                                                    startBucket = bucket;
                                                    break;
                                                }
                                            }

                                            if (!startBucket) {
                                                data.buckets.push({date: fixedStartDate, processes: [processId]});
                                            } else {
                                                if (jQuery.inArray(processId, startBucket.processes) == -1) {
                                                    startBucket.processes.push(processId);
                                                }
                                            }

                                            var endDate = new Date(schedule.end.actual.timet * 1000);
                                            var fixedEndDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                                            var endBucket = null;
                                            for (var bucketIndex = 0, bucketCount = data.buckets.length; bucketIndex < bucketCount; ++bucketIndex) {
                                                var bucket = data.buckets[bucketIndex];
                                                if (bucket.date.getTime() == fixedEndDate.getTime()) {
                                                    endBucket = bucket;
                                                    break;
                                                }
                                            }

                                            if (!endBucket) {
                                                data.buckets.push({date: fixedEndDate, processes: [processId]});
                                            } else {
                                                if (jQuery.inArray(processId, endBucket.processes) == -1) {
                                                    endBucket.processes.push(processId);
                                                }
                                            }
                                        }
                                    }

                                    // sort the buckets
                                    data.buckets.sort(function(a, b){
                                        if (a.date < b.date)
                                            return -1;
                                        if (a.date > b.date)
                                            return 1;
                                        return 0;
                                    });

                                    logToConsole(data);

                                    process(data);
                                }
                            }
                        }
                    });
                })(count);
            }
        }

        // Get the product pages id from the current spec
        var specId = unsafeWindow.getSpecIdFromURL();

        // 6 is the comment node type
        var specProductUrl = "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest/1/contentspec/get/json+text/" + specId;

        // see http://stackoverflow.com/questions/11007605/gm-xmlhttprequest-why-is-it-never-firing-the-onload-in-firefox
        // and http://wiki.greasespot.net/0.7.20080121.0_compatibility
        setTimeout(function(){
            GM_xmlhttpRequest({
                method: 'GET',
                url: specProductUrl,
                onabort: function() {handleFailure("onabort"); },
                onerror: function() {handleFailure("onerror");},
                ontimeout: function() {handleFailure("ontimeout");},
                onload: function(specResponse) {
                    var spec = JSON.parse(specResponse.responseText);

                    // 6 is the comment node type
                    var stringConstant = "http://topika.ecs.eng.bne.redhat.com:8080/pressgang-ccms/rest/1/stringconstant/get/json/74";

                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: stringConstant,
                        onabort: function() {handleFailure("onabort"); },
                        onerror: function() {handleFailure("onerror");},
                        ontimeout: function() {handleFailure("ontimeout");},
                        onload: function(stringConstantResponse) {
                            var mappingWrapper = JSON.parse(stringConstantResponse.responseText);
                            var mapping = JSON.parse(mappingWrapper.value);

                            var prodAndVer = spec.product;
                            if (spec.version) {
                                prodAndVer += " " + spec.version;
                            }
                            prodAndVer = prodAndVer.trim();


                            if (mapping[prodAndVer]) {
                                getSchedule(mapping[prodAndVer], 0);
                            } else {
                                logToConsole(prodAndVer + " has not been mapped to a product pages id");
                            }
                        }
                    });
                }
            });
        }, 0);
    }
})();