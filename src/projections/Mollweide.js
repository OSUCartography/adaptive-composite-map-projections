function Mollweide() {"use strict";

    var MAX_ITER = 10;
    var TOLERANCE = 1.0e-7;
    var ONE_TOL = 1.00000000000001;
    var HALFPI = Math.PI / 2;
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
        var abs, lon, lat;
        y = y / cy;
        abs = Math.abs(y);
        // arcsine with tolerance
        if (abs > 1) {
            if (abs >= ONE_TOL) {
                lonlat[0] = NaN;
                lonlat[1] = NaN;
                return;
            }
            lat = y < 0 ? -HALFPI : HALFPI;
        } else {
            lat = Math.asin(y);
        }

        lon = x / (cx * Math.cos(lat));
        if (lon > Math.PI || lon < -Math.PI) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
            return;
        }
        
        lonlat[0] = lon;
        lat += lat;
        lat = (lat + Math.sin(lat)) / cp;

        // sarcsine with tolerance
        abs = Math.abs(lat);
        if (abs >= 1) {
            if (abs > ONE_TOL) {
                lonlat[0] = NaN;
                lonlat[1] = NaN;
            } else {
                lonlat[1] = lat < 0 ? -HALFPI : HALFPI;
            }
        } else {
            lonlat[1] = Math.asin(lat);
        }
    };

    this.getOutline = function() {
        return GraticuleOutline.pointedPoleOutline(this);
    };

    this.getID = function() {
        return 54009;
    };
}