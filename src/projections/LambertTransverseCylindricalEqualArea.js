/*globals GraticuleOutline */
function LambertTransverseCylindricalEqualArea() {"use strict";

    // FIXME wrong name. Lambert cylindrical has lat0 = 0.  This is a general cylindrical equal area projection
    var lat0 = 0,

    // scale factor along central meridian
    k0 = 1;

    this.toString = function() {
        return 'Lambert Transverse Cylindrical';
    };

    this.isEqualArea = function() {
        return true;
    };

    this.initialize = function(conf) {
        lat0 = conf.lat0;
        // FIXME create second versions of forward and inverse for cases when lat0 == 0
    };

    this.forward = function(lon, lat, xy) {
        xy[0] = Math.cos(lat) * Math.sin(lon) / k0;
        xy[1] = k0 * (Math.atan2(Math.tan(lat), Math.cos(lon)) - lat0);
    };

    this.inverse = function(x, y, lonlat) {
        var t, D, r;
        t = x * k0;
        r = Math.sqrt(1 - t * t);
        D = y / k0 + lat0;
        lonlat[1] = Math.asin(r * Math.sin(D));
        lonlat[0] = Math.atan2(t, (r * Math.cos(D)));
    };

    this.getOutline = function() {
        var pts = [];
        pts[0] = -1;
        pts[1] = Math.PI - lat0;
        pts[2] = 1;
        pts[3] = Math.PI - lat0;
        pts[4] = 1;
        pts[5] = -Math.PI - lat0;
        pts[6] = -1;
        pts[7] = -Math.PI - lat0;
        return pts;
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID(),
            "falseNorthing" : -lat0
        };
    };

    this.getID = function() {
        // EPSG::9834 Lambert Cylindrical Equal Area (Spherical)
        // minus sign for transverse
        return -9834;
    };
}