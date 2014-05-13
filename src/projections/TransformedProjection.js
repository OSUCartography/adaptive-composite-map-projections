/**
 * A wrapper around a projection that applies a spherical rotation and vertical shift.
 */
function TransformedProjection(proj, dy, poleLat, onlyInverseRotation) {"use strict";

    var sinLatPole, cosLatPole;

    sinLatPole = Math.sin(poleLat);
    cosLatPole = Math.cos(poleLat);

    this.toString = function() {
        var txt = proj.toString();
        if (poleLat !== Math.PI / 2) {
            txt += " (Pole rotated to " + formatLatitude(poleLat) + ")";
        }
        return txt;
    };

    this.isEqualArea = function() {
        return ( typeof proj.isEqualArea === 'function') ? proj.isEqualArea() : false;
    };

    function obliqueTransformation(lon, lat, res) {
        var sinLon = Math.sin(lon), cosLon = Math.cos(lon), sinLat = Math.sin(lat), cosLat = Math.cos(lat);
        var cosLat_x_cosLon = cosLat * cosLon;
        res[0] = adjlon(aatan2(cosLat * sinLon, sinLatPole * cosLat_x_cosLon + cosLatPole * sinLat));
        sinLat = sinLatPole * sinLat - cosLatPole * cosLat_x_cosLon;
        res[1] = aasin(sinLat);
    }

    function obliqueTransformationInv(lon, lat, res) {
        var sinLon = Math.sin(lon), cosLon = Math.cos(lon), sinLat = Math.sin(lat), cosLat = Math.cos(lat);
        var cosLat_x_cosLon = cosLat * cosLon;
        res[0] = aatan2(cosLat * sinLon, sinLatPole * cosLat_x_cosLon - cosLatPole * sinLat);
        res[1] = aasin(sinLatPole * sinLat + cosLatPole * cosLat_x_cosLon);
    }


    this.forward = function(lon, lat, xy) {
        if (onlyInverseRotation) {
            proj.forward(lon, lat, xy);
        } else {
            obliqueTransformation(lon, lat, xy);
            proj.forward(xy[0], xy[1], xy);
        }
    };

    this.inverse = function(x, y, lonlat) {
        // for the forward, the vertical shift is applied when drawing the map
        y -= dy;
        proj.inverse(x, y, lonlat);
        obliqueTransformationInv(lonlat[0], lonlat[1], lonlat);
    };

    this.getOutline = function() {
        return proj.getOutline();
    };

    this.getShaderUniforms = function() {

        var uniforms = null, invertedPoleLat;
        if (proj && proj.getShaderUniforms) {
            uniforms = proj.getShaderUniforms();
        } else {
            uniforms = {};
        }

        invertedPoleLat = Math.PI - poleLat;
        uniforms.sinLatPole = Math.sin(invertedPoleLat);
        uniforms.cosLatPole = Math.cos(invertedPoleLat);
        uniforms.falseNorthing = dy;
        return uniforms;
    };

    this.getFalseNorthing = function() {
        return dy;
    };

    this.getPoleLatitude = function() {
        return poleLat;
    };

    this.getID = function() {
        return proj.getID();
    };
   
    /* CHANGE START */
    this.getPoleLat = function() {
        return poleLat;
    };
    /* CHANGE END */
}
