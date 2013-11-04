/**
 * The height of each process in the timeline
 * @type {number}
 */
var PRESSGANG_TIMELINE_ITEM_HEIGHT = 10;

var process = function (json) {
    var x = 0,
        r = Raphael("chart", window.innerWidth, 150),
        //labels = {},
        //textattr = {"font": '9px "Arial"', stroke: "none", fill: "#fff"},
        pathes = {},
        lgnd2 = $("#legend2")[0],
        usrnm2 = $("#username2")[0];
    function finishes() {

        // look for the first and last time an author is mentioned in a bucket
        for (var i in json.processes) {
            var start, end;

            // look for the last bucket (buckets have to be sorted by date)
            for (var j = json.buckets.length - 1; j >= 0; j--) {
                var isin = false;
                for (var k = 0, kk = json.buckets[j].processes.length; k < kk; k++) {
                    isin = isin || (json.buckets[j].processes[k][0] == i);
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
                    isin = isin || (json.buckets[j].processes[k][0] == i);
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
                    isin = isin || (json.buckets[j].processes[k][0] == i);
                }
                if (!isin) {
                    json.buckets[j].processes.push(i);
                }
            }
        }
    }
    function block() {
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
            r.text(x + 25, h + 10, dtext).attr({"font": '9px "Arial"', stroke: "none", fill: "#aaa"});
            x += 100;
        }
        var c = 0;
        for (var i in pathes) {
            //labels[i] = r.set();
            var clr = Raphael.getColor();
            pathes[i].p = r.path().attr({fill: clr, stroke: clr});
            var path = "M".concat(pathes[i].f[0][0], ",", pathes[i].f[0][1], "L", pathes[i].f[0][0] + 50, ",", pathes[i].f[0][1]);
            var th = Math.round(pathes[i].f[0][1] + (pathes[i].b[pathes[i].b.length - 1][1] - pathes[i].f[0][1]) / 2 + 3);
            //labels[i].push(r.text(pathes[i].f[0][0] + 25, th, pathes[i].f[0][2]).attr(textattr));
            var X = pathes[i].f[0][0] + 50,
                Y = pathes[i].f[0][1];
            for (var j = 1, jj = pathes[i].f.length; j < jj; j++) {
                path = path.concat("C", X + 20, ",", Y, ",");
                X = pathes[i].f[j][0];
                Y = pathes[i].f[j][1];
                path = path.concat(X - 20, ",", Y, ",", X, ",", Y, "L", X += 50, ",", Y);
                th = Math.round(Y + (pathes[i].b[pathes[i].b.length - 1 - j][1] - Y) / 2 + 3);
                if (th - 9 > Y) {
                    //labels[i].push(r.text(X - 25, th, pathes[i].f[j][2]).attr(textattr));
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
                    usrnm2.innerHTML = json.authors[i].n + " <em>(" + json.authors[i].c + " commits, " + json.authors[i].a + " additions, " + json.authors[i].d + " deletions)</em>";
                    lgnd2.style.backgroundColor = pathes[i].p.attr("fill");
                });
            })(i);
        }
    }
    if (json.error) {
        alert("Project not found. Try again.");
    } else {
        block();
    }
};