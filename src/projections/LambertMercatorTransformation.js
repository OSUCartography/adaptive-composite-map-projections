/**
Transition between Lambert azimuthal and Mercator projection, used for square-format maps.
The Lambert azimuthal is Wagner-transformed into a equal-area cylindrical projection. This 
transformed projection has an oblique aspect. It is blended with the Mercator projection with
equatorial aspect.
TODO 1 Currently the Lambert azimuthal is Wagner-transformed into a Lambert cylindrical. The standard
parallel should be adjusted to more closely approximate the shape of the Mercator projection.
TODO 2 Should the transformed Lambert azimuthal be horizontally scaled such that the Mercator and 
the Lambert cylindrical have the same width?
*/
function LambertMercatorTransformation(w) {

    var mercator, rotatedTransformedLambert, WEB_MERCATOR_MAX_LAT = 1.4844222297453322, temp_xy = [], poleLat;
    
    this.toString = function() {
        return "Transformation between Lambert azimuthal and Mercator";
    };

    this.isEqualArea = function() {
        return false;
    };

    this.initialize = function(conf) {
        mercator = new Mercator();
        mercator.initialize(conf);

        // FIXME adjust standard parallel
        var transLambert = TransformedLambertAzimuthal.LambertCylindrical();
        transLambert.transformToLambertAzimuthal(1 - w);

        poleLat = Math.PI / 2 - conf.lat0;
        rotatedTransformedLambert = new TransformedProjection(transLambert, 0, poleLat, false);
    };

    this.forward = function(lon, lat, xy) {
        rotatedTransformedLambert.forward(lon, lat, xy);
        mercator.forward(lon, lat, temp_xy);
        xy[0] = xy[0] * w + temp_xy[0] * (1 - w);
        xy[1] = xy[1] * w + temp_xy[1] * (1 - w);
    };

    this.inverse = function(x, y, lonlat) {

        // tolerance for approximating longitude and latitude
        // less than a hundreth of a second
        var TOL = 0.000000001;

        // maximum number of loops
        var MAX_LOOP = 1000;

        var HALFPI = Math.PI * 0.5;
        var counter = 0;
        var dx, dy;
        var lon = 0;
        var lat = 0;
        var xy = [];

        do {
            // forward projection
            this.forward(lon, lat, xy);
            // horizontal difference in projected coordinates
            dx = x - xy[0];
            // add half of the horizontal difference to the longitude
            lon += dx * 0.5;

            // vertical difference in projected coordinates
            if (dy === y - xy[1]) {
                // the improvement to the latitude did not change with this iteration
                // this is the case for polar latitudes
                lat = lat > 0 ? HALFPI : -HALFPI;
                dy = 0;
            } else {
                dy = y - xy[1];
            }

            // add half of the vertical difference to the latitude
            lat += dy * 0.5;

            // to guarantee stable forward projections,
            // latitude must not go beyond +/-PI/2
            if (lat < -HALFPI) {
                lat = -HALFPI;
            }
            if (lat > HALFPI) {
                lat = HALFPI;
            }

            // stop if it is not converging
            if ((counter += 1) === MAX_LOOP) {
                lon = NaN;
                lat = NaN;
                break;
            }

            // stop when difference is small enough
        } while (dx > TOL || dx < -TOL || dy > TOL || dy < -TOL);

        if (lon > Math.PI || lon < -Math.PI || lat > Math.PI / 2 || lat < -Math.PI / 2) {
            lonlat[0] = NaN;
            lonlat[1] = NaN;
        } else {
            lonlat[0] = lon;
            lonlat[1] = lat;
        }
    };

    this.getOutline = function() {
        if (w === 1) {
            return GraticuleOutline.circularOutline(2);
        } 
        if (w === 0) {
            return GraticuleOutline.rectangularOutline(this, WEB_MERCATOR_MAX_LAT, -Math.PI, -WEB_MERCATOR_MAX_LAT, Math.PI);
        }
        return GraticuleOutline.genericOutline(this);
    };

    this.getShaderUniforms = function() {
        var u, uniforms, uniforms1, uniforms2;
        
        uniforms = {
            "projectionID" : 123456.0,
            "mixWeight" : w,
            "mix1ProjectionID" : rotatedTransformedLambert.getID(),
            "mix2ProjectionID" : mercator.getID()
        };
        uniforms1 = rotatedTransformedLambert.getShaderUniforms();
        uniforms2 = mercator.getShaderUniforms();
        
        for (u in uniforms1) {
            if (uniforms1.hasOwnProperty(u) && !uniforms.hasOwnProperty(u)) {
                uniforms[u] = uniforms1[u];
            }
        }
        for (u in uniforms2) {
            if (uniforms2.hasOwnProperty(u) && !uniforms.hasOwnProperty(u)) {
                uniforms[u] = uniforms2[u];
            }
        }
        
        uniforms.falseNorthing = uniforms1.falseNorthing === undefined ? 0 : uniforms1.falseNorthing;
        uniforms.falseNorthing2 = uniforms2.falseNorthing === undefined ? 0 : uniforms2.falseNorthing;

        uniforms.sinLatPole = Math.sin(poleLat);
        uniforms.cosLatPole = Math.cos(poleLat);

        return uniforms;
    };
}