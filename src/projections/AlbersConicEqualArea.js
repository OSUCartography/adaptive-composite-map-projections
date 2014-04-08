/*globals formatLatitude*/

function AlbersConicEqualArea() {"use strict";
	
    var c, rho0, n, n2;
    var HALFPI = Math.PI / 2;
    var EPS10 = 1.0e-10;
                   
    this.toString = function() {
        return 'Albers Conic Equal Area (&Phi;\u2081=' + formatLatitude(this.lat1) + ' &Phi;\u2082=' + formatLatitude(this.lat2) + ')';
    };

    this.isEqualArea = function() {
        return true;
    };

    this.initialize = function(conf) {

        // FIXME
        this.lat1 = conf.lat1;
        this.lat2 = conf.lat2;

        var phi0 = conf.lat0, phi1 = conf.lat1, phi2 = conf.lat2;
        /*
         FIXME
         if(phi0 > HALFPI) {
         phi0 = HALFPI;
         }
         if(phi0 < -HALFPI) {
         phi0 = -HALFPI;
         }
         if(phi1 > HALFPI) {
         phi1 = HALFPI;
         }
         if(phi1 < -HALFPI) {
         phi1 = -HALFPI;
         }
         if(phi2 > HALFPI) {
         phi2 = HALFPI;
         }
         if(phi2 < -HALFPI) {
         phi2 = -HALFPI;
         }
         */
        if (Math.abs(phi1 + phi2) < EPS10) {
            n = NaN;
            throw new Error("Standard latitudes of Albers conic too close to equator");
        }

        var cosPhi1 = Math.cos(phi1), sinPhi1 = Math.sin(phi1);
        var secant = Math.abs(phi1 - phi2) >= EPS10;
        if (secant) {
            n = 0.5 * (sinPhi1 + Math.sin(phi2));
        } else {
            n = sinPhi1;
        }
        n2 = 2 * n;
        c = cosPhi1 * cosPhi1 + n2 * sinPhi1;
        rho0 = Math.sqrt(c - n2 * Math.sin(phi0)) / n;

    };

    this.forward = function(lon, lat, xy) {
        var rho, n_x_lon;
        rho = c - n2 * Math.sin(lat);
        if (rho < 0) {
            xy[0] = NaN;
            xy[1] = NaN;
        }
        rho = Math.sqrt(rho) / n;
        n_x_lon = n * lon;
        xy[0] = rho * Math.sin(n_x_lon);
        xy[1] = rho0 - rho * Math.cos(n_x_lon);
    };

    this.inverse = function(x, y, lonlat) {
        var rho, phi;
        y = rho0 - y;
        rho = Math.sqrt(x * x + y * y);
        if (rho === 0) {
            lonlat[0] = 0;
            lonlat[1] = n > 0 ? HALFPI : -HALFPI;
        } else {
            phi = rho * n;
            phi = (c - phi * phi) / n2;
            if (Math.abs(phi) <= 1) {
                lonlat[1] = Math.asin(phi);
            } else {
                lonlat[1] = phi < 0 ? -HALFPI : HALFPI;
            }

            if (n < 0) {
                lonlat[0] = Math.atan2(-x, -y) / n;
            } else {
                lonlat[0] = Math.atan2(x, y) / n;
            }
        }

    };

    this.getOutline = function() {
        return GraticuleOutline.conicOutline(this);
    };

    this.getShaderUniforms = function() {
        return {
            "projectionID" : this.getID(),
            "albersC" : c,
            "albersRho0" : rho0,
            "albersN" : n
        };
    };

    this.getID = function() {
        return 11;
    };
}