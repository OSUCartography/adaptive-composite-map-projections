function LambertAzimuthalEqualAreaOblique() {"use strict";

    var EPS10 = 1.e-10, lat0, cosLat0, sinLat0;

    lat0 = 0;
    cosLat0 = 1;
    sinLat0 = 0;

    this.toString = function() {
        var txt = 'Lambert Azimuthal ';
        txt += Math.abs(lat0) < Math.PI / 2 - EPS10 ? 'Oblique' : 'Polar';
        return txt;
    };

    this.isEqualArea = function() {
        return true;
    };

    this.initialize = function(conf) {
        lat0 = conf.lat0;
        cosLat0 = Math.cos(lat0);
        sinLat0 = Math.sin(lat0);
    };

    this.forward = function(lon, lat, xy) {
        var sinLat = Math.sin(lat);
        var cosLat = Math.cos(lat);
        var cosLon = Math.cos(lon);
        var sinLon = Math.sin(lon);
        var y = 1 + sinLat0 * sinLat + cosLat0 * cosLat * cosLon;
        // the projection is indeterminate for lon = PI and lat = -lat0
        // this point would have to be plotted as a circle
        // The following Math.sqrt will return NaN in this case.
        y = Math.sqrt(2 / y);
        xy[0] = y * cosLat * sinLon;
        xy[1] = y * (cosLat0 * sinLat - sinLat0 * cosLat * cosLon);
    };

    this.inverse = function(x, y, lonlat) {
        var dd = x * x + y * y;
        if (dd > 4) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
            return;
        }
        var rh = Math.sqrt(dd);
        var phi = rh * 0.5;
        phi = 2. * Math.asin(phi);
        var sinz = Math.sin(phi);
        var cosz = Math.cos(phi);
        lonlat[1] = phi = (rh <= EPS10) ? lat0 : Math.asin(cosz * sinLat0 + y * sinz * cosLat0 / rh);
        x *= sinz * cosLat0;
        y = (cosz - Math.sin(phi) * sinLat0) * rh;
        lonlat[0] = (y === 0) ? 0 : Math.atan2(x, y);
    };

    this.getOutline = function() {
        return GraticuleOutline.circularOutline(2);
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID(),
            "sinLatPole" : sinLat0,
            "cosLatPole" : cosLat0

        };
    };

    this.getID = function() {
        return -2;
    };
}