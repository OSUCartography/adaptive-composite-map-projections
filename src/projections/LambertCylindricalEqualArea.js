/*globals GraticuleOutline */

function LambertCylindricalEqualArea() {"use strict";

    var dy = 0;

    this.toString = function() {
        return 'Lambert Cylindrical Equal Area';
    };

    this.isEqualArea = function() {
        return true;
    };

    this.isCylindrical = function() {
        return true;
    };

    this.forward = function(lon, lat, xy) {
        xy[0] = lon;
        xy[1] = Math.sin(lat);
    };

    this.inverse = function(x, y, lonlat) {
        var lat = Math.asin(y - dy);
        if (x > Math.PI || x < -Math.PI || isNaN(lat)) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
        } else {
            lonlat[0] = x;
            lonlat[1] = lat;
        }
    };
    
    this.initialize = function() {
    };

    this.getOutline = function() {
        return GraticuleOutline.rectangularOutline(this, Math.PI / 2, -Math.PI, -Math.PI / 2, Math.PI);
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
        return -1;
    };
}