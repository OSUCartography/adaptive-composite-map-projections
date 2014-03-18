function WeightedProjectionMix(projection1, projection2, weight1) {

    var proj1 = projection1;
    var proj2 = projection2;
    var temp_xy = [];
    var w1 = weight1;
    var w2 = 1 - w1;
    var dy1 = proj1.getFalseNorthing ? proj1.getFalseNorthing() : 0;
    var dy2 = proj2.getFalseNorthing ? proj2.getFalseNorthing() : 0;

    this.toString = function() {
        var w1Str = " (" + Math.round(w1 * 100) + "%)";
        var w2Str = " (" + Math.round(w2 * 100) + "%)";
        var name2 = projection2.toString();
        var name1 = projection1.toString();
        return name1 + w1Str + " and <br>" + name2 + w2Str;
    };

    this.isEqualArea = function() {
        return false;
    };

    this.forward = function(lon, lat, xy) {
        proj1.forward(lon, lat, xy);
        proj2.forward(lon, lat, temp_xy);
        xy[0] = xy[0] * w1 + temp_xy[0] * w2;
        xy[1] = (xy[1] + dy1) * w1 + (temp_xy[1] + dy2) * w2;
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
        // don't use generic outline if one of the weights equals 1, as the outline might be impossible to
        // model with a generic outline (e.g., azimuthals require a circle)
        if (w1 === 1) {
            return proj1.getOutline();
        } 
        if (w2 === 1) {
            return proj2.getOutline();
        }
        return GraticuleOutline.genericOutline(this);
    };

    this.getShaderUniforms = function() {
        var u, uniforms, uniforms1, uniforms2;
        
        uniforms = {
            "projectionID" : -9999.0,
            "mixWeight" : w1,
            "mix1ProjectionID" : proj1.getID(),
            "mix2ProjectionID" : proj2.getID()
        };
        uniforms1 = proj1.getShaderUniforms();
        uniforms2 = proj2.getShaderUniforms();

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
        
        return uniforms;
    };
}