function NaturalEarth() {"use strict";

    var MAX_Y = 0.8707 * 0.52 * Math.PI;

    this.toString = function() {
        return 'Natural Earth';
    };
    
    this.isEqualArea = function() {
		return false;
	};

    this.forward = function(lon, lat, xy) {
        var lat2 = lat * lat, lat4 = lat2 * lat2;
        xy[0] = lon * (0.8707 - 0.131979 * lat2 + lat4 * (-0.013791 + lat4 * (0.003971 * lat2 - 0.001529 * lat4)));
        xy[1] = lat * (1.007226 + lat2 * (0.015085 + lat4 * (-0.044475 + 0.028874 * lat2 - 0.005916 * lat4)));
    };

    this.inverse = function(x, y, lonlat) {
        var yc, tol, y2, y4, f, fder, lon;

        if (y > MAX_Y || y < -MAX_Y) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
            return;
        }

        // Newton's method for the latitude
        yc = y;
        for (; ; ) {
            y2 = yc * yc;
            y4 = y2 * y2;
            f = (yc * (1.007226 + y2 * (0.015085 + y4 * (-0.044475 + 0.028874 * y2 - 0.005916 * y4)))) - y;
            fder = 1.007226 + y2 * (0.015085 * 3 + y4 * (-0.044475 * 7 + 0.028874 * 9 * y2 - 0.005916 * 11 * y4));
            yc -= tol = f / fder;
            if (Math.abs(tol) < 0.0000000001) {
                break;
            }
        }

        // longitude
        y2 = yc * yc;
        lon = x / (0.8707 + y2 * (-0.131979 + y2 * (-0.013791 + y2 * y2 * y2 * (0.003971 - 0.001529 * y2))));
        if (lon > Math.PI || lon < -Math.PI) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
        } else {
            lonlat[0] = lon;
            lonlat[1] = yc;
        }
    };

    this.getOutline = function() {
        return GraticuleOutline.pseudoCylindricalOutline(this);
    };

    this.getShaderUniforms = function() {
        return {
            // random number
            "projectionID" : 7259365.0
        };
    };

    this.getID = function() {
        return 7259365;
    };
}