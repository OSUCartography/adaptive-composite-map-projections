// cross-browser requestAnimationFrame and cancelAnimationFrame
// http://www.paulirish.com/2011/requestanimationframe-for-smart-animating/
( function() {
        var x, lastTime = 0;
        var vendors = ['webkit', 'moz'];
        for ( x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
            window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
            window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || window[vendors[x] + 'CancelRequestAnimationFrame'];
        }

        if (!window.requestAnimationFrame)
            window.requestAnimationFrame = function(callback, element) {
                var currTime = new Date().getTime();
                var timeToCall = Math.max(0, 16 - (currTime - lastTime));
                var id = window.setTimeout(function() {
                    callback(currTime + timeToCall);
                }, timeToCall);
                lastTime = currTime + timeToCall;
                return id;
            };

        if (!window.cancelAnimationFrame)
            window.cancelAnimationFrame = function(id) {
                clearTimeout(id);
            };
    }());

function isPowerOfTwo(x) {"use strict";
    /*jslint bitwise:true */
    return (x & (x - 1)) === 0;
}

function nextHighestPowerOfTwo(x) {"use strict";
    var i;
    x -= 1;
    /*jslint bitwise:true */
    for ( i = 1; i < 32; i <<= 1) {
        x = x | x >> i;
    }
    /*jslint bitwise:false */
    return x + 1;
}

function createCanvas(id, parent, desiredWidthInCSSPixels, desiredHeightInCSSPixels) {"use strict";
    var devicePixelRatio, canvas;

    canvas = document.createElement('canvas');
    canvas.setAttribute("id", id);

    // FIXME remove absolute positioning
    canvas.style.position = 'absolute';
    canvas.style.left = '0px';
    canvas.style.top = '0px';

    resizeCanvasElement(canvas, desiredWidthInCSSPixels, desiredHeightInCSSPixels);

    // canvas is not selectable. Without this, the mouse changes to a text
    // selection cursor while dragging on Safari.
    canvas.onselectstart = function() {
        return false;
    };

    parent.appendChild(canvas);
    return canvas;
}

function resizeCanvasElement(canvas, desiredWidthInCSSPixels, desiredHeightInCSSPixels) {"use strict";
    // http://www.khronos.org/webgl/wiki/HandlingHighDPI

    // set the display size of the canvas.
    canvas.style.width = desiredWidthInCSSPixels + "px";
    canvas.style.height = desiredHeightInCSSPixels + "px";

    // set the size of the drawingBuffer
    var devicePixelRatio = window.devicePixelRatio || 1;

    // FIXME disable for now, layers need to be updated first
    devicePixelRatio = 1;
	
	// FIXME crash on Mac Firefox 
    canvas.width = desiredWidthInCSSPixels * devicePixelRatio;
    canvas.height = desiredHeightInCSSPixels * devicePixelRatio;
}

// http://stackoverflow.com/questions/646628/javascript-startswith
if ( typeof String.prototype.startsWith !== 'function') {
    String.prototype.startsWith = function(str) {
        return this.slice(0, str.length) == str;
    };
}

if ( typeof String.prototype.endsWith !== 'function') {
    String.prototype.endsWith = function(suffix) {"use strict";
        return this.indexOf(suffix, this.length - suffix.length) !== -1;
    };
}

// from High Performance JavaScript
if (!String.prototype.trim) {
    String.prototype.trim = function() {
        var str = this.replace(/^\s+/, ""), end = str.length - 1, ws = /\s/;
        while (ws.test(str.charAt(end))) {
            end -= 1;
        }
        return str.slice(0, end + 1);
    };
}

// O'Reilly JavaScript Patterns
if ( typeof Array.isArray === "undefined") {
    Array.isArray = function(arg) {
        return Object.prototype.toString.call(arg) === "[object Array]";
    };
}

if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(needle) {
        var i;
        for ( i = 0, n = this.length; i < n; i++) {
            if (this[i] === needle) {
                return i;
            }
        }
        return -1;
    };
}

function addEvtListener(element, eventName, callback) {"use strict";
    if ( typeof (element) === "string") {
        element = document.getElementById(element);
    }
    if (element === null) {
        return;
    }

    if (element.addEventListener) {
        if (eventName === 'mousewheel') {
            element.addEventListener('DOMMouseScroll', callback, false);
        }
        element.addEventListener(eventName, callback, false);
    } else if (element.attachEvent) {
        element.attachEvent("on" + eventName, callback);
    }
}

function removeEvtListener(element, eventName, callback) {
    if ( typeof (element) == "string")
        element = document.getElementById(element);
    if (element == null)
        return;
    if (element.removeEventListener) {
        if (eventName == 'mousewheel')
            element.removeEventListener('DOMMouseScroll', callback, false);
        element.removeEventListener(eventName, callback, false);
    } else if (element.detachEvent)
        element.detachEvent("on" + eventName, callback);
}

function cancelEvent(e) {
    e = e ? e : window.event;
    if (e.stopPropagation)
        e.stopPropagation();
    if (e.preventDefault)
        e.preventDefault();
    e.cancelBubble = true;
    e.cancel = true;
    e.returnValue = false;
    return false;
}

function loadData(url, callback) {

    var i, xhr, activeXids = ['MSXML2.XMLHTTP.3.0', 'MSXML2.XMLHTTP', 'Microsoft.XMLHTTP'];

    xhr.onreadystatechange = function() {
        if (xhr.readyState != 4) {
            return false;
        }
        if (xhr.status !== 200) {
            console.error("XMLHttpRequest error, status code: " + xhr.status, xhr.statusText);
            return false;
        }
        callback(xhr.responseText);
    };

    if ( typeof XMLHttpRequest != undefined) {
        xhr = new XMLHttpRequest();
    } else {// IE before 7
        for ( i = 0; i < activeXids.length; i += 1) {
            try {
                xhr = new ActiveXObject(activeXids[i]);
                break;
            } catch (e) {
            }
        }
    }

    xhr.open("GET", url, true);
    xhr.send();
}

function formatLatitude(lat) {
    if (isNaN(lat)) {
        return "&ndash;";
    }
    return Math.abs(lat / Math.PI * 180).toFixed(1) + "\u00B0" + (lat < 0 ? "S" : "N");
}

function formatLongitude(lon) {
    if (isNaN(lon)) {
        return "&ndash;";
    }
    return Math.abs(lon / Math.PI * 180).toFixed(1) + "\u00B0" + (lon < 0 ? "W" : "E");
}
