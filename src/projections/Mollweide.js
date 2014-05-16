function Mollweide() {"use strict";

    var MAX_ITER = 10;
    var TOLERANCE = 1.0e-7;
    var ONE_TOL = 1.00000000000001;
    var HALFPI = Math.PI / 2;
    var SQRT2 = Math.sqrt(2);
    var cx, cy, cp;

    this.toString = function() {
        return 'Mollweide';
    };

    this.isEqualArea = function() {
        return true;
    };

    // FIXME
    (function() {
        var p = Math.PI / 2, r, sp, p2 = p + p;
        sp = Math.sin(p);
        r = Math.sqrt(Math.PI * 2.0 * sp / (p2 + Math.sin(p2)));
        cx = 2 * r / Math.PI;
        cy = r / sp;
        cp = p2 + Math.sin(p2);
    })();

    this.forward = function(lon, lat, xy) {
        var k, v, i;
        k = cp * Math.sin(lat);
        for ( i = MAX_ITER; i !== 0; i--) {
            lat -= v = (lat + Math.sin(lat) - k) / (1 + Math.cos(lat));
            if (Math.abs(v) < TOLERANCE) {
                break;
            }
        }
        if (i === 0) {
            lat = (lat < 0) ? -Math.PI / 2 : Math.PI / 2;
        } else {
            lat *= 0.5;
        }
        xy[0] = cx * lon * Math.cos(lat);
        xy[1] = cy * Math.sin(lat);
    };

    this.inverse = function(x, y, lonlat) {
        var theta, sinTheta, cosTheta;
        sinTheta = y / SQRT2;
        theta = Math.asin(sinTheta);
        cosTheta = Math.cos(theta);
        lonlat[0] = x / (2 * SQRT2) * Math.PI / cosTheta;
        lonlat[1] = Math.asin(2 * (theta + sinTheta * cosTheta) / Math.PI);
    };

    this.getOutline = function() {
        return GraticuleOutline.pointedPoleOutline(this);
    };

    this.getID = function() {
        return 54009;
    };
}