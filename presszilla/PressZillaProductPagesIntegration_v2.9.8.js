(function(){
    /**
     * The height of each process in the timeline
     * @type {number}
     */
    var PRESSGANG_TIMELINE_ITEM_HEIGHT = 10;

    /**
     * The height of a process in the timeline
     * @type {number}
     */
    var TIMELINE_ITEM_HEIGHT = 23;

    /**
     * The margine above the timeline
     * @type {number}
     */
    var TIMELINE_VERTICAL_OFFSET = 32;

    /**
     * The width of a given date in the timeline
     * @type {number}
     */
    var TIMELINE_ITEM_WIDTH = 110;

    /**
     * The number of times to retry the product pages API
     * @type {number}
     */
    var PRODUCT_PAGES_RETRY = 5;

    function hashCode(s) {
        return s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);
    }

    // Edited from http://raphaeljs.com/github/impact-code.js
    var process = function (json) {

        logToConsole("Creating offscreen rendering area");

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
        var timelineWidth = json.buckets.length * TIMELINE_ITEM_WIDTH;

        var timelineChartDiv = jQuery('<div id="timelineChartDiv" style="position: absolute; top:' + TIMELINE_VERTICAL_OFFSET + 'px; left: 316px; right: 0; height: ' + timelineHeight + 'px; overflow-x: auto; overflow-y: "></div>');
        timelineChartDiv.appendTo(jQuery('#offscreenRendering'));

        // raphael charts need to be drawn in an element attached to the DOM
        setTimeout(function() {

            timelineChartDiv.appendTo(jQuery("body"));
            jQuery("body").css("margin-top", (timelineHeight + TIMELINE_VERTICAL_OFFSET) + "px");

            var x = 0,
                timelineChart = Raphael("timelineChartDiv", timelineWidth, timelineHeight),
                //labels = {},
                //textattr = {"font": '9px "Arial"', stroke: "none", fill: "#fff"},
                pathes = {},
                lgnd2 = jQuery('<div style="position: absolute; top: 0; left: 316px; width: 24px; height: 24px;"></div>'),
                usrnm2 = jQuery('<div style="position: absolute; top: 0; left: 348px"></div>');

            jQuery("body").append(lgnd2);
            jQuery("body").append(usrnm2);

            function finishes() {

                logToConsole("finishes()");

                // look for the first and last time an author is mentioned in a bucket
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
                            json.buckets[j].processes.push(i);
                        }

                        json.buckets[j].processes.sort();
                    }
                }
            }
            function block() {

                logToConsole("block()");

                var p, h;
                finishes();
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
                    timelineChart.text(x + 25, h + 10, dtext).attr({"font": '9px "Arial"', stroke: "none", fill: "#aaa"});
                    x += 100;
                }
                var c = 0;
                for (var i in pathes) {
                    //labels[i] = timelineChart.set();

                    var clr = json.processes[i].color;

                    pathes[i].p = timelineChart.path().attr({fill: clr, stroke: clr});
                    var path = "M".concat(pathes[i].f[0][0], ",", pathes[i].f[0][1], "L", pathes[i].f[0][0] + 50, ",", pathes[i].f[0][1]);
                    var th = Math.round(pathes[i].f[0][1] + (pathes[i].b[pathes[i].b.length - 1][1] - pathes[i].f[0][1]) / 2 + 3);
                    //labels[i].push(timelineChart.text(pathes[i].f[0][0] + 25, th, pathes[i].f[0][2]).attr(textattr));
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
                        }
                    }
                    path = path.concat("L", pathes[i].b[0][0] + 50, ",", pathes[i].b[0][1], ",", pathes[i].b[0][0], ",", pathes[i].b[0][1]);
                    for (var j = 1, jj = pathes[i].b.length; j < jj; j++) {
                        path = path.concat("C", pathes[i].b[j][0] + 70, ",", pathes[i].b[j - 1][1], ",", pathes[i].b[j][0] + 70, ",", pathes[i].b[j][1], ",", pathes[i].b[j][0] + 50, ",", pathes[i].b[j][1], "L", pathes[i].b[j][0], ",", pathes[i].b[j][1]);
                    }
                    pathes[i].p.attr({path: path + "z"});
                    //labels[i].hide();
                    var current = null;
                    (function (i) {
                        pathes[i].p.mouseover(function () {
                            if (current != null) {
                                //labels[current].hide();
                            }
                            current = i;
                            //labels[i].show();
                            pathes[i].p.toFront();
                            //labels[i].toFront();
                            usrnm2[0].innerHTML = json.processes[i].name;
                            lgnd2[0].style.backgroundColor = pathes[i].p.attr("fill");
                        });
                    })(i);
                }
            }

            block();

        }, 0);


    };

    var solutionsUrl = "https://pp.engineering.redhat.com/pp/action/explorer/fedora-20/all/cpe,schedule/";
    function getSchedule(count) {
        if (count >= PRODUCT_PAGES_RETRY) {
            // handle error
        } else {

            logToConsole("Getting Schedules");

            GM_xmlhttpRequest({
                method: 'GET',
                url: solutionsUrl,
                headers: {Accept: 'application/json'},
                onabort: function() {logToConsole("onabort"); getSchedule(++count);},
                onerror: function() {logToConsole("onerror"); getSchedule(++count);},
                onprogress: function() {logToConsole("onprogress");},
                onreadystatechange: function() {logToConsole("onreadystatechange");},
                ontimeout: function() {logToConsole("ontimeout"); getSchedule(++count);},
                onload: function(response) {
                    logToConsole(response);

                    var responseJson = JSON.parse(response.responseText);

                    if (responseJson.length != 0 && responseJson[0].schedule) {

                        var data = {buckets: [], processes: {}};
                        var maxId = 0;

                        for (var scheduleIndex = 0, scheduleCount = responseJson[0].schedule.length; scheduleIndex < scheduleCount; ++scheduleIndex) {
                            var schedule = responseJson[0].schedule[scheduleIndex];
                            var processId = null;
                            for (var scheduleDetails in data.processes) {
                                if (data.processes[scheduleDetails] == schedule.name) {
                                    processId = scheduleDetails;
                                    break;
                                }
                            }

                            if (!processId) {
                                processId = maxId;
                                ++maxId;

                                var hash = hashCode(schedule.name);
                                var mask = parseInt("11111111", 2);

                                var red = (hash & mask) / mask;
                                hash = hash << 2;
                                var green = (hash & mask) / mask;
                                hash = hash << 2;
                                var blue = (hash & mask) / mask;

                                var clr = Raphael.getRGB("rgb(" + (red * 255) + "," + (green * 255) + "," + (blue * 255) + ")");

                                data.processes[processId] = {name: schedule.name, color: clr};
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
            });
        }
    }

    getSchedule(0);

})();