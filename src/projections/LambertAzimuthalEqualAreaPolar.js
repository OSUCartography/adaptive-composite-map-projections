/*globals GraticuleOutline */
//Lambert Azimuthal Equal-Area Projection polar aspect

// The equatorial Lambert azimuthal in the vertex shader creates artifacts, which are due to the
// limited precision of single precision floating point values.
// Degenerate cases are created with the sqrt function applied to very small numbers.
// The polar aspects are more stable and also faster to evaluate as less math calls are required.

// Equatorial equations after Snyder with artifacts in GLSL:
// float k = sqrt(2. / (1. + cosLat * cosLon));
// float x = k * cosLat * sinLon;
// float y = k * sinLat;

function LambertAzimuthalEqualAreaPolar() {"use strict";

    var FORTPI = Math.PI / 4, southPole = false;

    // FIXME is this needed?
    var dy = 0;

    this.toString = function() {
        return 'Lambert Azimuthal';
    };

    this.isEqualArea = function() {
        return true;
    };

    function forwardNorthPole(lon, lat, xy) {
        var y = 2 * Math.sin(FORTPI - lat * 0.5);
        xy[0] = y * Math.sin(lon);
        xy[1] = y * -Math.cos(lon);
    }

    function forwardSouthPole(lon, lat, xy) {
        var y = 2 * Math.cos(FORTPI - lat * 0.5);
        xy[0] = y * Math.sin(lon);
        xy[1] = y * Math.cos(lon);
    }

    function inverseNorthPole(x, y, lonlat) {
        var rh, phi;
        y -= dy;
        rh = Math.sqrt(x * x + y * y);
        phi = rh * 0.5;
        lonlat[0] = Math.atan2(x, -y);
        if (phi > 1) {
            lonlat[1] = Math.PI / 2;
        } else {
            lonlat[1] = 2 * (FORTPI - Math.asin(phi));
        }
    }

    function inverseSouthPole(x, y, lonlat) {
        var rh, phi;
        y -= dy;
        rh = Math.sqrt(x * x + y * y);
        phi = rh * 0.5;
        lonlat[0] = Math.atan2(x, y);
        if (phi > 1) {
            lonlat[1] = -Math.PI / 2;
        } else {
            lonlat[1] = 2 * (-FORTPI + Math.asin(phi));
        }
    }


    this.initialize = function(conf) {
        southPole = conf.lat0 < 0;
        if (southPole) {
            this.forward = forwardSouthPole;
            this.inverse = inverseSouthPole;
        } else {
            this.forward = forwardNorthPole;
            this.inverse = inverseNorthPole;
        }
    };

    // invoke initialize() to create this.forward and this.inverse
    this.initialize({
        lat0 : Math.PI / 2
    });

    this.getOutline = function() {
        return GraticuleOutline.circularOutline(2);
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID(),
            "falseNorthing" : dy
        };
    };

    this.getFalseNorthing = function() {
        return dy;
    };

    // FIXME setFalseNorthing?
    this.setVerticalShift = function(verticalShift) {
        dy = verticalShift;
    };

    this.getID = function() {
        return southPole ? -3 : -2;
    };
}