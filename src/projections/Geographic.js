function Geographic() {"use strict";

    var MAX_Y = Math.PI / 2;

    this.toString = function() {
        return 'Plate Carr\u00E9e (Geographic)';
    };

    this.isEqualArea = function() {
        return false;
    };
	
    this.forward = function(lon, lat, xy) {
        xy[0] = lon;
        xy[1] = lat;
    };

    this.inverse = function(x, y, lonlat) {
        if (y > MAX_Y || y < -MAX_Y || x > Math.PI || x < -Math.PI) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
        } else {
            lonlat[1] = y;
            lonlat[0] = x;
        }
    };

    this.getOutline = function() {
        return GraticuleOutline.rectangularOutline(this, MAX_Y, -Math.PI, -MAX_Y, Math.PI);
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID()
        };
    };

    this.getID = function() {
        return 4979;
    };
}
