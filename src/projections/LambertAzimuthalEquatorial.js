/*globals GraticuleOutline*/

function LambertAzimuthalEquatorial() {"use strict";

    var FORTPI = Math.PI / 4, EPS10 = 1.e-10;

    this.toString = function() {
        return 'Lambert Azimuthal';
    };

    this.isEqualArea = function() {
        return true;
    };

    this.initialize = function(conf) {
    };

    this.forward = function(lon, lat, xy) {
        var k = 2 * Math.sin(FORTPI - lat * 0.5);
        xy[0] = k * Math.sin(lon);
        xy[1] = k * -Math.cos(lon);
        /*
        var x, y, sinLat = Math.sin(lat), cosLat = Math.cos(lat), cosLon = Math.cos(lon), sinLon = Math.sin(lon);
        y = 1 + cosLat * cosLon;
        if (y < EPS10) {
            xy[0] = NaN;
            xy[1] = NaN;
        } else {
            y = Math.sqrt(2 / y);
            x = y * cosLat * sinLon;
            y *= sinLat;

            xy[0] = x;
            xy[1] = y;
        }*/
    };

    this.inverse = function(x, y, lonlat) {
        var cosz, rh, sinz, phi;

        rh = Math.sqrt(x * x + y * y);
        phi = rh * 0.5;
        if (phi > 1) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
            return;
        }
        phi = 2 * Math.asin(phi);
        sinz = Math.sin(phi);
        cosz = Math.cos(phi);

        lonlat[1] = (Math.abs(rh) <= EPS10) ? 0 : Math.asin(y * sinz / rh);
        x *= sinz;
        y = cosz * rh;
        lonlat[0] = (y === 0) ? 0 : Math.atan2(x, y);
    };

    this.getOutline = function() {
        return GraticuleOutline.circularOutline(2);
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID()
        };
    };

    this.getID = function() {
        return 28;
    };
}