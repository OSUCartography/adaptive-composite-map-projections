    #ifdef GL_ES
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    #endif

    #define EPS 1e-7

    #define PI 3.14159265358979323846
    #define HALFPI (3.14159265358979323846 / 2.)
    #define M_1_PI 0.31830988618379067154
    #define WEB_MERCATOR_MAX_LAT 1.4844222297453322

    #define EPSG_MERCATOR 3857.
    #define EPSG_ROBINSON 54030.
    #define EPSG_GEOGRAPHIC 4979.
    #define EPSG_SINUSOIDAL 54008.
    #define EPSG_LAMBERT_CYLINDRICAL_TRANSVERSE -9834.

    #define TRANSFORMED_WAGNER_ID 654267985.
    #define NATURAL_EARTH_ID 7259365.
    #define CANTERS1_ID 53287562.
    #define CANTERS2_ID 38426587.
    #define CYLINDRICAL_EQUAL_AREA_ID -1.
    #define MIXPROJECTION -9999.0

    // FIXME should be int
    uniform float projectionID;

    // projections to mix and weight for the mix
    // FIXME should be int
    uniform float mix1ProjectionID;
    // FIXME should be int
    uniform float mix2ProjectionID;
    uniform float mixWeight;

    uniform sampler2D texture;
    varying vec2 textureCoord;
    varying float alongAntimeridian;

    uniform vec2 scaleXY;
    uniform vec2 dXY;

    // vertical shift
    uniform float falseNorthing;

    // vertical shift for the second projection in a mix
    uniform float falseNorthing2;

    // spherical rotation
    uniform float sinLatPole;
    uniform float cosLatPole;

    // central meridian
    uniform float meridian;

    // parameters for transformed Lambert azimuthal
    uniform float wagnerM;
    uniform float wagnerN;
    uniform float wagnerCA;
    uniform float wagnerCB;

    // parameters for Albers conic
    // FIXME prepend with "albers"
    uniform float n;
    uniform float c;
    uniform float rho0;

    vec2 transformSphere(in vec2 lonLat) {
        vec2 sinLonLat = sin(lonLat);
        vec2 cosLonLat = cos(lonLat);
        float sinLon = sinLonLat.x;
        float cosLon = cosLonLat.x;
        float sinLat = sinLonLat.y;
        float cosLat = cosLonLat.y;
        float cosLat_x_cosLon = cosLat * cosLon;

    	// TODO can this be optimized using vec2 for sinLatPole and cosLatPole?
    	// FIXME normalize
    	float lon = /*normalizeLam(*/atan(cosLat * sinLon, sinLatPole * cosLat_x_cosLon + cosLatPole * sinLat)/*)*/;
    	float lat = asin(sinLatPole * sinLat - cosLatPole * cosLat_x_cosLon);
    	
    	// shift longitude by central longitude
        // FIXME
        // causes flickering along +/-180deg
    	//lon = 2.0 * PI * (fract(0.5 * M_1_PI * (lon + meridian) + 0.5) - 0.5);
        // causes vertical line beyond poles > normalize lon?
        //lon += meridian;
        
        return vec2(lon, lat);
    }

    // A polynomial version of the Robinson projection.
    // Canters, F., Decleir, H. 1989. The world in perspective – A directory of 
    // world map projections. Chichester, John Wiley and Sons: p. 143.
    vec4 robinson(in float lon, in float lat) {
        float lat2 = lat * lat;
        float x = lon * (0.8507 - lat2 * (0.1450 + lat2 * 0.0104));
        float y = lat * (0.9642 - lat2 * (0.0013 + lat2 * 0.0129));
        return vec4(x, y + falseNorthing, 0., 1.);
    }

    // B. Savric et al., A polynomial equation for the Natural Earth projection,
    // in: Cartography and Geographic Information Science, 38-4, pp. 363–372, 2011.
    vec4 naturalEarth(in float lon, in float lat) {
        float lat2 = lat * lat;
        float lat4 = lat2 * lat2;
        float x = lon * (0.8707 - 0.131979 * lat2 + lat4 * (-0.013791 + lat4 * (0.003971 * lat2 - 0.001529 * lat4)));
        float y = lat * (1.007226 + lat2 * (0.015085 + lat4 * (-0.044475 + 0.028874 * lat2 - 0.005916 * lat4)));
        return vec4(x, y + falseNorthing, 0., 1.);
    }

    vec4 geographic(in float lon, in float lat) {
        return vec4(lon, lat + falseNorthing, 0., 1.);
    }

    vec4 sinusoidal(in float lon, in float lat) {
        float x = lon * cos(lat);
        return vec4(x, lat + falseNorthing, 0., 1.);
    }

    // Canters, F. (2002) Small-scale Map projection Design. p. 218-219.
    // Modified Sinusoidal, equal-area.
    vec4 canters1(in float lon, in float lat) {
        const float C1 = 1.1966;
        const float C3 = -0.1290;
        const float C3x3 = 3. * C3;
        const float C5 = -0.0076;
        const float C5x5 = 5. * C5;
        float y2 = lat * lat;
        float y4 = y2 * y2;
        float x = lon * cos(lat) / (C1 + C3x3 * y2 + C5x5 * y4);
        float y = lat * (C1 + C3 * y2 + C5 * y4);
        return vec4(x, y + falseNorthing, 0., 1.);
    }

    // Canters, F. (2002) Small-scale Map projection Design. p. 218-220.
    // Modified Sinusoidal, equal-area.
    vec4 canters2(in float lon, in float lat) {
        const float C1 = 1.1481;
        const float C3 = -0.0753;
        const float C3x3 = 3. * C3;
        const float C5 = -0.0150;
        const float C5x5 = 5. * C5;
        float y2 = lat * lat;
        float y4 = y2 * y2;
        float x = lon * cos(lat) / (C1 + C3x3 * y2 + C5x5 * y4);
        float y = lat * (C1 + C3 * y2 + C5 * y4);
        return vec4(x, y + falseNorthing, 0., 1.);
    }

    vec4 cylindricalEqualArea(in float lon, in float lat) {
        float x = lon;
        float y = sin(lat);
        return vec4(x, y + falseNorthing, 0., 1.);
    }

    vec4 transformedWagner(in vec2 lonLat) {

        lonLat.x *= wagnerN;
        vec2 sinLonLat = sin(lonLat);
        float sinLon = sinLonLat.x;
        float sinLat = sinLonLat.y;
        float cosLon = cos(lonLat.x);
        
        float sinO = wagnerM * sinLat;
        float cosO = sqrt(1. - sinO * sinO);
        float d = sqrt(2. / (1. + cosO * cosLon));
        float x = wagnerCA * d * cosO * sinLon;
        float y = wagnerCB * d * sinO;
        return vec4(x, y + falseNorthing, 0., 1.);
    }

    vec4 albersConic(in float lon, in float lat) {
        float rho = c - 2. * n * sin(lat);
        rho = sqrt(rho) / n;
        float n_x_lon = n * lon;
        float x = rho * sin(n_x_lon);
        float y = rho0 - rho * cos(n_x_lon);
        return vec4(x, y + falseNorthing, 0., 1.);
    }

    vec4 lambertAzimuthalNorthPolar(in float lon, in float lat) {
        float k = 2. * sin(PI / 4. - lat / 2.);
        float x = k * sin(lon);
        float y = -k * cos(lon);
        return vec4(x, y + falseNorthing, 0., 1.);
    }

    vec4 lambertAzimuthalSouthPolar(in float lon, in float lat) {
        float k = 2. * cos(PI / 4. - lat / 2.);
        float x = k * sin(lon);
        float y = k * cos(lon);
        return vec4(x, y + falseNorthing, 0., 1.);
    }

    vec4 mercator(in float lon, in float lat) {
        if (lat > WEB_MERCATOR_MAX_LAT) {
            lat = WEB_MERCATOR_MAX_LAT;
            } else if (lat < -WEB_MERCATOR_MAX_LAT) {
                lat = -WEB_MERCATOR_MAX_LAT;
            }
            float y = log(tan(0.5 * (PI / 2. + lat)));        
            return vec4(lon, y + falseNorthing, 0., 1.);
        }

        vec4 lambertCylindricalTransverse(in float lon, in float lat) {
            float k0 = 1.;
            float lat0 = 0.;

            float x = cos(lat) * sin(lon) / k0;
            float y = k0 * (atan(tan(lat), cos(lon)) - lat0);

            return vec4(x, y + falseNorthing, 0., 1.);
        }

        vec4 project(in vec2 lonLat, in float projectionID) {
            float lon;
            float lat;

            lon = lonLat.x;
            lat = lonLat.y;

        // world map projections
        if (projectionID == TRANSFORMED_WAGNER_ID) {
            return transformedWagner(lonLat);
            } else if (projectionID == EPSG_ROBINSON) {
                return robinson(lon, lat);
                } else if (projectionID == NATURAL_EARTH_ID) {
                    return naturalEarth(lon, lat);
                    } else if (projectionID == EPSG_GEOGRAPHIC) {
                        return geographic(lon, lat);
                        } else if (projectionID == EPSG_SINUSOIDAL) {
                            return sinusoidal(lon, lat);
                            } else if (projectionID == CANTERS1_ID) {
                                return canters1(lon, lat);
                                } else if (projectionID == CANTERS2_ID) {
                                    return canters2(lon, lat);
                                    } else if (projectionID == CYLINDRICAL_EQUAL_AREA_ID) {
                                        return cylindricalEqualArea(lon, lat);
                                    }

        // continental scale projection
        else if (projectionID == 28.){
            // FIXME should be replaced with polar aspects
            return lambertAzimuthalNorthPolar(lon, lat);
        }
        
        // continental and regional scale projections
        else if (projectionID == 11.) {
            return albersConic(lon, lat);
            } else if (projectionID == -2.) {
                return lambertAzimuthalNorthPolar(lon, lat);
                } else if (projectionID == -3.) {
                    return lambertAzimuthalSouthPolar(lon, lat);
                    } else if (projectionID == EPSG_MERCATOR) {
                        return mercator(lon, lat);
        } else {//if (projectionID == EPSG_LAMBERT_CYLINDRICAL_TRANSVERSE) {
            return lambertCylindricalTransverse(lon, lat);
        }   
    }

    vec2 projectionMix(in vec2 lonLat) {
        vec2 xy1 = project(lonLat, mix1ProjectionID).xy;
        vec2 xy2 = project(lonLat, mix2ProjectionID).xy;
        xy2.y += falseNorthing2 - falseNorthing;
        return mix(xy2, xy1, mixWeight);
    }

    vec2 invGeographic(in vec2 xy) {
        if (any(lessThan(xy, vec2(-PI, -PI/2.))) || any(greaterThan(xy, vec2(PI, PI/2.)))) {
            discard;
        }
        return xy;
    }

    vec2 invSinusoidal(in vec2 xy) {
        float lat = xy.y;
        if (lat > PI / 2. || lat < -PI / 2.) {
            discard;
        }
        float lon = xy.x / cos(xy.y);
        if (lon > PI || lon < -PI) {
            discard;
        }
        return vec2 (lon, xy.y);
    }

    // Canters, F. (2002) Small-scale Map projection Design. p. 218-219.
    // Modified Sinusoidal, equal-area.
    vec2 invCanters1(in vec2 xy) {
        const float C1 = 1.1966;
        const float C3 = -0.1290;
        const float C3x3 = 3. * C3;
        const float C5 = -0.0076;
        const float C5x5 = 5. * C5;
        
        const int MAX_ITERATIONS = 20;
        float lon = 0.;
        float lat = 0.;
        vec2 xy2, dxy;
        for (int i = 0; i < MAX_ITERATIONS; i++) {
            // forward projection
            xy2 = canters1(lon, lat).xy;
            // horizontal difference in projected coordinates
            dxy = xy - xy2;
            // add half of the horizontal difference to the longitude
            lon += dxy.x * 0.5;
            // add half of the vertical difference to the latitude
            lat += dxy.y * 0.5;
            /*
            // to guarantee stable forward projections,
            // latitude must not go beyond +/-PI/2
            if (lat < -HALFPI) {
                lat = -HALFPI;
            }
            if (lat > HALFPI) {
                lat = HALFPI;
            }
            */
            // stop when difference is small enough
            if (all(lessThan(abs(dxy), vec2(EPS)))) {
                break;
            }
        }
        return vec2(lon, lat);
    }

    vec2 invTransformedWagner(in vec2 xy) {
        // FIXME uniforms wagnerCA and wagnerCB should be vec2
        xy /= vec2(wagnerCA, wagnerCB);
        
        float l = dot(xy, xy); // x * x + y * y
        if (l > 4.) {
            discard;
        }
        // if x * x + y * y equals 4, the point is on the bounding circle of the
        // Lambert azimuthal (the limiting case). This should never happen, as
        // inverseLambertAzimuthal() should be used in this case . If it does happen,
        // z is NaN and the following computations will return NaN coordinates.
        float z = sqrt(1. - 0.25 * l);
        float sinLat = z * xy.y / wagnerM;
        if (sinLat < -1. || sinLat > 1.) {
            discard;
        }
        float zz2_1 = 2. * z * z - 1.;
        xy *= z;
        float lon = atan(xy.x, zz2_1) / wagnerN;
        if (lon > PI || lon < -PI) {
            discard;
        }
        
        float lat = asin(xy.y / wagnerM);
        return vec2 (lon, lat);
    }

    vec2 invNaturalEarth(in vec2 xy){
        const float MAX_Y = 0.8707 * 0.52 * PI;
        const int MAX_ITERATIONS = 20;
        float yc, tol, y2, y4, f, fder, lon;
        
        if (xy.y > MAX_Y || xy.y < -MAX_Y) {
            discard;
        }
        
        // Newton's method for the latitude
        yc = xy.y;
        for (int i = 0; i < MAX_ITERATIONS; i++) {
            y2 = yc * yc;
            y4 = y2 * y2;
            f = (yc * (1.007226 + y2 * (0.015085 + y4 * (-0.044475 + 0.028874 * y2 - 0.005916 * y4)))) - xy.y;
            fder = 1.007226 + y2 * (0.015085 * 3. + y4 * (-0.044475 * 7. + 0.028874 * 9. * y2 - 0.005916 * 11. * y4));
            yc -= tol = f / fder;
            if (abs(tol) < EPS) {
                break;
            }
        }
        
        // longitude
        y2 = yc * yc;
        lon = xy.x / (0.8707 + y2 * (-0.131979 + y2 * (-0.013791 + y2 * y2 * y2 * (0.003971 - 0.001529 * y2))));
        if (lon > PI || lon < -PI) {
            discard;
        }
        return vec2(lon, yc);
    }

    vec2 invRobinson(in vec2 xy){

        const float MAX_Y = 1.38615911291;
        const int MAX_ITERATIONS = 20;
        float yc, tol, y2, y4, f, fder, lon;
        
        if (xy.y > MAX_Y || xy.y < -MAX_Y) {
            discard;
        }
        
        // compute latitude with Newton's method
        yc = xy.y;
        for (int i = 0; i < MAX_ITERATIONS; i++) {
            y2 = yc * yc;
            f = (yc * (0.9642 - y2 * (0.0013 + y2 * 0.0129))) - xy.y;
            fder = 0.9642 - y2 * (0.0013 * 3. + y2 * 0.0129 * 5.);
            yc -= tol = f / fder;
            if (abs(tol) < EPS) {
                break;
            }
        }
        
        // longitude
        y2 = yc * yc;
        lon = xy.x / (0.8507 - y2 * (0.1450 + y2 * 0.0104));
        if (lon > PI || lon < -PI) {
            discard;
        }
        return vec2(lon, yc);
    }

    vec2 invLambertAzimuthalNorthPolar(in vec2 xy) {
        float d = length(xy);
        if (d > 2.) {
            discard;
        }
        float lon = atan(xy.x, -xy.y);
        float lat = - 2. * asin(d / 2.) + PI / 2.;
        return vec2 (lon, lat);
    }

    vec2 invLambertAzimuthalSouthPolar(in vec2 xy) {
        float d = length(xy);
        if (d > 2.) {
            discard;
        }
        float lon = atan(xy.x, xy.y);
        float lat = 2. * asin(d / 2.) - PI / 2.;
        return vec2 (lon, lat);
    }

    vec2 invAlbersConic(in vec2 xy) {
        xy.y = rho0 - xy.y;
        float rho = length(xy);
        if (rho == 0.) {
            return vec2(0., n > 0. ? PI / 2. : -PI / 2.);
        }
        float lon, lat;
        float phi = rho * n;
        phi = (c - phi * phi) / (n * 2.);
        if (abs(phi) > 1.) {
            discard;
        }
        lat = asin(phi);
        
        if (n < 0.) {
            lon = atan(-xy.x, -xy.y) / n;
            } else {
                lon = atan(xy.x, xy.y) / n;
            }
            if (lon > PI || lon < -PI) {
                discard;
            }
            return vec2(lon, lat);
        }

        vec2 invCylindricalEqualArea(in vec2 xy) {
            if (xy.x > PI || xy.x < -PI || xy.y > 1. || xy.y < -1.) {
                discard;
            }
            return vec2(xy.x, asin(xy.y));
        }

        vec2 invProjection(in vec2 xy, in float projectionID) {

        // world map projections
        if (projectionID == TRANSFORMED_WAGNER_ID) {
          return invTransformedWagner(xy);
      }
      else if (projectionID == EPSG_ROBINSON) {
          return invRobinson(xy);
      }
      else if (projectionID == NATURAL_EARTH_ID) {
          return invNaturalEarth(xy);
      }
      else if (projectionID == EPSG_GEOGRAPHIC) {
          return invGeographic(xy);
      }
      else if (projectionID == EPSG_SINUSOIDAL) {
          return invSinusoidal(xy);
      }
      else if (projectionID == CANTERS1_ID) {
          return invCanters1(xy);
      }
        /*else if (projectionID == CANTERS2_ID) {
         return canters2(lon, lat);
         }*/
         else if (projectionID == CYLINDRICAL_EQUAL_AREA_ID) {
          return invCylindricalEqualArea(xy);
      }
        // continental scale projection
        else if (projectionID == 28.){
          return invLambertAzimuthalNorthPolar(xy);
      }

    	// continental and regional scale projections
    	else if (projectionID == 11.) {
    		return invAlbersConic(xy);
    	}
        else if (projectionID == -2.) {
          return invLambertAzimuthalNorthPolar(xy);
      }
        else {//if (projectionID == -3.) {
          return invLambertAzimuthalSouthPolar(xy);
      }
        /*
         if (projectionID == EPSG_MERCATOR) {
         return mercator(lon, lat);
         }
         if (projectionID == EPSG_LAMBERT_CYLINDRICAL_TRANSVERSE) {
         return lambertCylindricalTransverse(lon, lat);
         }
         */
        //discard;
    }

    vec2 invProjectionMix(in vec2 xy) {

        // maximum number of loops
        const int MAX_LOOP = 25;
        
        float dx, dy;
        vec2 inv1 = invProjection(xy, mix1ProjectionID);
        vec2 inv2 = invProjection(xy, mix2ProjectionID);
        
        vec2 inv = mix(inv2, inv1, mixWeight);
        float lon = inv.x;
        float lat = inv.y;
        
        for (int i = 0; i < MAX_LOOP; i++) {
            // forward projection
            vec2 approxXY = projectionMix(vec2(lon, lat));
            // horizontal difference in projected coordinates
            dx = xy.x - approxXY.x;
            // add half of the horizontal difference to the longitude
            lon += dx * 0.5;
            
            // vertical difference in projected coordinates
            dy = xy.y - approxXY.y;
            
            // add half of the vertical difference to the latitude
            lat += dy * 0.5;
            
            // stop when difference is small enough
            if (abs(dx) < EPS && abs(dy) < EPS) {
                break;
            }
        }
        
        if (lon > PI || lon < -PI || lat > PI / 2. || lat < -PI / 2.) {
            discard;
        }
        return vec2(lon, lat);
    }

    void main(void) {
        if (alongAntimeridian > 0.) {
            vec2 xy = (gl_FragCoord.xy - dXY) / scaleXY * 2.;
            xy.y -= falseNorthing;
            
            vec2 lonLat;
            if (projectionID == MIXPROJECTION) {
                lonLat = invProjectionMix(xy);
                } else {
                    lonLat = invProjection(xy, projectionID);
                }

                if (cosLatPole != 0.) {
                    lonLat = transformSphere(lonLat);
                }
                lonLat.x += meridian;

            // FIXME: use gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1); when texture is loaded instead
            lonLat.y *= -1.;

            gl_FragColor = texture2D(texture, lonLat / vec2(PI * 2., PI) + 0.5);
            /*if (meridian > 0.) {
                gl_FragColor.r = 1.;
                }*/
                } else {
                    gl_FragColor = texture2D(texture, textureCoord);
                }

            }