/**
 * Wrapper around a projection that vertically shifts projected coordinates for inverse projection.
 * @param {Object} proj
 * @param {Object} dy
 */

function ShiftedProjection(proj, dy) {"use strict";

    this.toString = function() {
        var txt = proj.toString();
        //txt += " (vertically shifted)";
        return txt;
    };

    this.isEqualArea = function() {
        return proj.isEqualArea();
    };
    
    this.forward = function(lon, lat, xy) {
    	proj.forward(lon, lat, xy);
    	// for the forward, the vertical shift is applied when drawing the map
    };

    this.inverse = function(x, y, lonlat) {
        y -= dy;
        proj.inverse(x, y, lonlat);
    };

    this.getOutline = function() {
        return proj.getOutline();
    };

    this.getShaderUniforms = function() {

        var uniforms = {};
        if (proj && proj.getShaderUniforms) {
            uniforms = proj.getShaderUniforms();
        }
        uniforms.falseNorthing = dy;
        return uniforms;
    };

    this.getFalseNorthing = function() {
        return dy;
    };

}
