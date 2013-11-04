(function(){

    var retries = 5;
    var solutionsUrl = "https://pp.engineering.redhat.com/pp/action/explorer/fedora-20/all/cpe,schedule/";

    function getSchedule(count) {
        if (count >= retries) {
            // handle error
        } else {
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
                    var responseJson = JSON.parse(response);

                    if (responseJson.length != 0 && responseJson[0].schedule) {

                        var data = {buckets: [], processes: {}};

                        for (var scheduleIndex = 0, scheduleCount = responseJson[0].schedule.length; scheduleIndex < scheduleCount; ++scheduleIndex) {
                            var schedule = responseJson[0].schedule[scheduleIndex];
                            var foundSchedule = false;
                            var maxId = null;
                            var processId = null;
                            for (var scheduleDetails in data.processes) {
                                if (data.processes[scheduleDetails] == schedule.name) {
                                    foundSchedule = true;
                                    processId = scheduleDetails;
                                }

                                if (!maxId || maxId < scheduleDetails) {
                                    maxId = scheduleDetails;
                                }
                            }

                            if (!foundSchedule) {
                                processId = maxId ? 0 : maxId + 1;
                                data.processes[processId] = schedule.name;
                            }

                            var startDate = new Date(schedule.start.actual.timet * 1000);
                            var endDate = new Date(schedule.end.actual.timet * 1000);
                            var startBucket = null;
                            var endBucket = null;
                            for (var bucketIndex = 0, bucketCount = data.buckets.length; bucketIndex < bucketCount; ++bucketIndex) {
                                var bucket = data.buckets[bucketIndex];
                                if (bucket.date == startDate) {
                                    startBucket = bucket;
                                }

                                if (bucket.date == endDate) {
                                    endBucket = bucket;
                                }

                                if (startBucket && endBucket) {
                                    break;
                                }
                            }

                            if (!startBucket) {
                                data.buckets.push({date: startDate, processes: [processId]});
                            } else {
                                startBucket.processes.push(processId);
                            }

                            if (!endBucket) {
                                data.buckets.push({date: endDate, processes: [processId]});
                            } else {
                                endBucket.processes.push(processId);
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
                    }
                }
            });
        }
    }
})();