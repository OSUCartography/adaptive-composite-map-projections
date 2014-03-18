/*globals GraticuleOutline*/
function Mercator() {"use strict";

    var PI_HALF = Math.PI / 2, WEB_MERCATOR_MAX_LAT = 1.4844222297453322, dy = 0;

    this.toString = function() {
        return 'Mercator';
    };

    this.isEqualArea = function() {
        return false;
    };

    this.isConformal = function() {
        return true;
    };

    this.initialize = function(conf) {
        // compute vertical shift for Mercator projection
        // such that the central latitude appears in the center of the map.
        var xy = [];
        this.forward(0, conf.lat0, xy);
        dy = -xy[1];
    };

    this.setVerticalShift = function(verticalShift) {
        dy = verticalShift;
    };

    this.forward = function(lon, lat, xy) {
        xy[0] = lon;
        if (lat > WEB_MERCATOR_MAX_LAT) {
            lat = WEB_MERCATOR_MAX_LAT;
        } else if (lat < -WEB_MERCATOR_MAX_LAT) {
            lat = -WEB_MERCATOR_MAX_LAT;
        }
        xy[1] = Math.log(Math.tan(0.5 * (PI_HALF + lat))) + dy;
    };

    this.inverse = function(x, y, lonlat) {
        lonlat[0] = x;
        lonlat[1] = PI_HALF - 2 * Math.atan(Math.exp(-y + dy));
    };

    this.getOutline = function() {
        return GraticuleOutline.rectangularOutline(this, WEB_MERCATOR_MAX_LAT, -Math.PI, -WEB_MERCATOR_MAX_LAT, Math.PI);
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID(),
            "falseNorthing" : dy
        };
    };

    this.getID = function() {
        // EPSG:3857 web Mercator
        return 3857;
    };
}