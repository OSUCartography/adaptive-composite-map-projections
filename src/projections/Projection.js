// FIXME move following functions in utility file

// FIXME there should be a better method to do this
/* reduce argument to range +/- PI */
function adjlon(lon) {
    var SPI = 3.14159265359, TWOPI = 2 * Math.PI;

    if (Math.abs(lon) <= SPI) {
        return lon;
    }
    // adjust to 0..2pi rad
    lon += Math.PI;
    // remove integral # of 'revolutions'
    lon -= TWOPI * Math.floor(lon / TWOPI);
    // adjust back to -pi..pi rad
    lon -= Math.PI;
    return lon;
}

function aasin(v) {
    var ONE_TOL = 1.00000000000001, av = Math.abs(v);
    if (av >= 1) {
        if (av > ONE_TOL) {
            return NaN;
        }
        return v < 0 ? -Math.PI / 2 : Math.PI / 2;
    }
    return Math.asin(v);
}

function aatan2(n, d) {
    var ATOL = 1.0e-50;
    return ((Math.abs(n) < ATOL && Math.abs(d) < ATOL) ? 0 : Math.atan2(n, d));
}

function ProjectionFactory() {
}

ProjectionFactory.getSmallScaleProjection = function(smallScaleProjectionName) {
    switch (smallScaleProjectionName) {
        case 'Canters1':
            return new Canters1();
        case 'Canters2':
            return new Canters2();
        case 'CylindricalEqualArea':
            return TransformedLambertAzimuthal.LambertCylindrical();
        case 'Eckert4':
            return new Eckert4();
        case 'Geographic':
            return new Geographic();
        case 'Mollweide':
            return new Mollweide();
        case 'NaturalEarth':
            return new NaturalEarth();
        case 'PseudoCylindricalEqualArea':
            return TransformedLambertAzimuthal.PseudoCylindricalEqualArea();
        case 'QuarticAuthalic':
            return TransformedLambertAzimuthal.QuarticAuthalic();
        case 'Robinson':
            return new Robinson();
        case 'Sinusoidal':
            return new Sinusoidal();
        case 'Wagner7':
            return TransformedLambertAzimuthal.Wagner7();
        default:
            return TransformedLambertAzimuthal.Hammer();
    }
};

ProjectionFactory.create = function(conf) {

    function smallScaleVerticalShift(conf, proj) {
        if (conf.lat0 === 0 || conf.mapScale < 1) {
            return 0;
        }
        var mapH = conf.mapDimension[1];
        if (mapH > ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection(proj)) {
            // the canvas is larger than the graticule
            return 0;
        }

        // only a part of the graticule is visible
        var pt = [];
        proj.forward(0, conf.lat0, pt);
        var dy = -pt[1];
        var dMax = ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection(proj) - mapH;
        if (dy > dMax) {
            dy = dMax;
        } else if (dy < -dMax) {
            dy = -dMax;
        }
        return dy;
    }

    function smallScaleTransformation(conf, proj) {

        var poleLat, dy;

        if (conf.rotateSmallScale) {
            poleLat = Math.PI / 2 - conf.lat0;
            return new TransformedProjection(proj, 0, poleLat, true);
        } else {
            // we could use this: return ;
            // the following alternative is more efficient, but adds an additional function call.
            dy = smallScaleVerticalShift(conf, proj);
            proj.falseNorthing = dy;
            proj = new ShiftedProjection(proj, dy);
            proj.falseNorthing = dy;

            /*
             // override the inverse function to take the false northing into account
             (function() {
             var originalInverse, falseNorthing;
             // store reference to original
             originalInverse = proj.inverse;
             falseNorthing = dy;
             // Define overriding method.
             proj.inverse = function() {
             arguments[1] -= falseNorthing;
             // Execute the original method.
             return originalInverse.apply(this, arguments);
             };
             })();
             */
            return proj;
        }
    }

    function getMediumToLargeScaleProjectionForPortraitFormat(conf) {
        var w = (conf.mapScale - conf.scaleLimit4) / (conf.scaleLimit5 - conf.scaleLimit4);
        var p1 = new LambertTransverseCylindricalEqualArea();
        p1.initialize(conf);
        var p2 = new LambertAzimuthalEqualAreaOblique();
        p2.initialize(conf);
        return new WeightedProjectionMix(p1, p2, w);
    }

    function useCylindrical(conf) {
        var xy = [];
        var m = conf.cylindricalLowerLat / (conf.scaleLimit5 - conf.scaleLimit4);
        var c = conf.cylindricalLowerLat - m * conf.scaleLimit5;
        var latLimit = m * conf.mapScale + c;

        // FIXME hack: add transformation from azimuthal to cylindrical
        // replace if condition with 
        // if (Math.abs(conf.lat0) < conf.cylindricalLowerLat) {
        
         if (Math.abs(conf.lat0) < latLimit) {
            var cylProj = new LambertCylindricalEqualArea();
            // compute vertical shift for cylindrical projection
            // such that the central latitude appears in the center of the map.
            cylProj.forward(0, conf.lat0, xy);
            cylProj.setVerticalShift(-xy[1]);
            // for GUI display, void unused standard latitudes
            conf.lat1 = NaN;
            conf.lat2 = NaN;
            return cylProj;
        }
    }

    function getMediumToLargeScaleConicProjectionForLandscapeFormat(conf) {

        // Scale is between conf.scaleLimit4 and conf.scaleLimit5.
        // Use an oblique Albers conic projection that smoothly blends between
        // the medium scale azimuthal and the large scale conic as scale changes.
        // For scales close to the medium-scale azimuthal projection, the two standard
        // parallels and the central latitude of the conic projection are close to
        // the pole. This results in a conic projection that is almost azimuthal and
        // centered on a pole. The globe is additionally rotated to bring the
        // central latitude to the center of the canvas.

        // compute rotation angle and vertical shift applied to medium-scale
        // azimuthal projection for the scale equal to conf.scaleLimit4

        var azimuthalProj = new LambertAzimuthalEqualAreaOblique();
        azimuthalProj.initialize(conf);

        // compute the vertical shift
        var w = (conf.scaleLimit5 - conf.mapScale) / (conf.scaleLimit5 - conf.scaleLimit4);
        var dy = Math.abs(conf.topPt[1] - conf.bottomPt[1]) / 2 * w;
        if (conf.lat0 < 0) {
            dy = -dy;
        }

        // compute the rotation angle latRot that is applied to recenter the shifted graticule
        var t = new ShiftedProjection(azimuthalProj, dy);
        var centerLonLat = [];
        t.inverse(conf.centerXY[0], conf.centerXY[1], centerLonLat);
        var latRot = conf.lat0 - centerLonLat[1];

        // standard parallels of the conic with normal aspect and rotated globe
        var largeScaleAlbers = ProjectionFactory.largeScaleAlbersConicForLandscapeFormat(conf);
        var lat0Conic = conf.lat0;
        var lat1Conic = largeScaleAlbers.lat1;
        var lat2Conic = largeScaleAlbers.lat2;
        // position of north pole counted from equator
        var poleLatConic = Math.PI / 2 - latRot;

        // standard parallels of a "flat" conic that corresponds to an azimuthal on north or south pole
        var lat0Azimuthal, lat1Azimuthal, lat2Azimuthal, poleLatAzimuthal;
        if (conf.lat0 > 0) {
            // central latitude and standard parallels are on the north pole
            lat0Azimuthal = lat1Azimuthal = lat2Azimuthal = Math.PI / 2;
            // the north pole is rotated from its normal position at 90 deg by (90-lat0)
            poleLatAzimuthal = Math.PI - conf.lat0 - latRot;
        } else {
            // central latitude and standard parallels are on the south pole
            lat0Azimuthal = lat1Azimuthal = lat2Azimuthal = -Math.PI / 2;
            // north pole moves towards the equator
            poleLatAzimuthal = -conf.lat0 - latRot;
        }

        // blend values for the oblique conic
        var w1 = (conf.scaleLimit5 - conf.mapScale) / (conf.scaleLimit5 - conf.scaleLimit4);
        var w2 = 1 - w1;
        var obliqueConicConf = {
            lat0 : w1 * lat0Azimuthal + w2 * lat0Conic,
            lat1 : w1 * lat1Azimuthal + w2 * lat1Conic,
            lat2 : w1 * lat2Azimuthal + w2 * lat2Conic,
            poleLat : w1 * poleLatAzimuthal + w2 * poleLatConic
        };

        // adjust standard parallels for GUI display
        // FIXME
        conf.lat1 = conf.lat0 + (obliqueConicConf.lat0 - obliqueConicConf.lat1);
        conf.lat2 = conf.lat0 + (obliqueConicConf.lat0 - obliqueConicConf.lat2);

        var obliqueConicProj = new AlbersConicEqualAreaOblique(dy);
        obliqueConicProj.initialize(obliqueConicConf);
        return obliqueConicProj;
    }

    function getMediumToLargeScaleProjectionForLandscapeFormat(conf) {

        // FIXME transition between cylindrical and conic
        var cylProj = useCylindrical(conf);
        if (cylProj) {
            return cylProj;
        }

        // use azimuthal projection to show poles
        if (Math.abs(conf.lat0) > conf.polarUpperLat) {
            return ProjectionFactory.shiftedLambertAzimuthalPolar(conf);
        }

        return getMediumToLargeScaleConicProjectionForLandscapeFormat(conf);
    }

    function getMediumScaleProjection(conf) {
        var landscapeFormat, polarAziProj, dy, dx, m, c, y, xl, w, lat0, conicPoleY, poleSign;

        landscapeFormat = (conf.canvasHeight / conf.canvasWidth) < conf.formatRatioLimit;
        if (landscapeFormat) {
            // interpolate lat0 of Lambert azimuthal projection. For scales larger
            // than conf.scaleLimit4, a polar azimuthal without spherical rotation is used near poles.
            // Interpolate towards this polar projection.
            dy = Math.PI / 2 - conf.polarUpperLat;
            dx = conf.scaleLimit4 - conf.scaleLimit2;
            m = -dy / dx;
            c = Math.PI / 2 - m * conf.scaleLimit2;
            y = conf.mapScale * m + c;
            if (Math.abs(conf.lat0) > y) {
                xl = (Math.abs(conf.lat0) - c) / m;
                w = (conf.mapScale - xl) / (conf.scaleLimit4 - xl);
                
                // lat0 is 90deg when north pole is at the center of the map 
                poleSign = (conf.lat0 > 0) ? 1 : -1;
                lat0 = (conf.lat0 - poleSign * Math.PI / 2) * w + poleSign * Math.PI - conf.lat0;

                // compute vertical shift of the azimuthal projection
                conicPoleY = ProjectionFactory.verticalCoordinateOfFlattenedAlbersConicPole(conf);
                dy = conf.centerXY[1] - conicPoleY;
                return new TransformedProjection(new LambertAzimuthalEqualAreaPolar(), -dy * w, lat0, true);
            }
        }
        // the meta pole is not at Math.PI / 2 - conf.lat0 as for global projections, because
        // we are using a polar Lambert azimuthal, not an equatorial.
        return new TransformedProjection(new LambertAzimuthalEqualAreaPolar(), 0, Math.PI - conf.lat0, true);
    }

    /**
     * Returns a projection for a zoom level between conf.scaleLimit1 and conf.scaleLimit2.
     * Creates a transformed Lambert azimuthal or a mix of two projection.
     * For both cases, a vertical shift may be needed if the projection for world maps cannot be rotated.
     */
    function getSmallToMediumScaleProjection(conf) {
        var projection, w, poleLat, p1, p2, dy;

        projection = ProjectionFactory.getSmallScaleProjection(conf.smallScaleProjectionName);

        // weight is linear interpolation between two scale limits
        w = (conf.scaleLimit2 - conf.mapScale) / (conf.scaleLimit2 - conf.scaleLimit1);

        if ( projection instanceof TransformedLambertAzimuthal) {
            // Use a weight for a smooth transition from the transformed to the regular Lambert azimuthal projection
            projection.transformToLambertAzimuthal(w);
        } else {
            // small scale projection is not a transformed Lambert azimuthal
            // create a blend between the small-scale projection and the Lambert azimuthal (via a modified Hammer)
            p1 = ProjectionFactory.getSmallScaleProjection(conf.smallScaleProjectionName);
            // TODO use a transformed Lambert with a pole line when the world projection has a pole line?
            p2 = TransformedLambertAzimuthal.Hammer();
            p2.transformToLambertAzimuthal(w);
            projection = new WeightedProjectionMix(p1, p2, w);
        }

        if (conf.rotateSmallScale) {
            // latitude of the transformed pole
            poleLat = Math.PI / 2 - conf.lat0;
            // no vertical shift
            dy = 0;
        } else {
            // latitude of the transformed pole
            poleLat = Math.PI / 2 - (1 - w) * conf.lat0;
            // compute vertical shift such that lat0 appears at the center of the map when zoomed out
            dy = smallScaleVerticalShift(conf, new TransformedProjection(projection, 0, poleLat, false));
        }
        return new TransformedProjection(projection, dy, poleLat, true);
    }

    /**
     * Returns a projection blend of the large scale projection and the Mercator (used for largest scales)
     */
     function getLargeScaleToMercatorProjection(conf) {
        var w, p1, mercator, canvasRatio;

        // FIXME add special treatment for central latitudes close to poles, because the
        // web Mercator ends at approx. +/- 85 degrees north and south
        
        canvasRatio = conf.canvasHeight / conf.canvasWidth;
        if (canvasRatio < conf.formatRatioLimit || canvasRatio > 1 / conf.formatRatioLimit) {
            // portrait or landscape format
            mercator = new Mercator();
            mercator.initialize(conf);
            w = 1 - (conf.mapScale - conf.mercatorLimit1) / (conf.mercatorLimit2 - conf.mercatorLimit1);
            p1 = ProjectionFactory.createLargeScaleProjection(conf);
            p1.initialize(conf);
            return new WeightedProjectionMix(p1, mercator, w);
        } else {
            // square format
            /*
            // this works, but is not compatibel with vertex shader, because only one of the the projections is rotated.
            p1 = TransformedLambertAzimuthal.LambertCylindrical();
            // weight is linearly interpolated between the two Mercator scale limits
            w = (conf.mercatorLimit2 - conf.mapScale) / (conf.mercatorLimit2 - conf.mercatorLimit1);
            p1.transformToLambertAzimuthal(1 - w);
            poleLat = Math.PI / 2 - conf.lat0;
            var t = new TransformedProjection(p1, 0, poleLat, false);
            return new WeightedProjectionMix(t, mercator, w);
            */
            // same as commented code above, but packaged into a separate projection.
            // vertex shader will see this as a separate projection and use different schema for texture mapping
            w = (conf.mercatorLimit2 - conf.mapScale) / (conf.mercatorLimit2 - conf.mercatorLimit1);
            var transProj = new LambertMercatorTransformation(w);
            transProj.initialize(conf);
            return transProj;
        }        
    }

    function getMediumToLargeScaleProjection(conf) {
        var projection, canvasRatio;
        canvasRatio = conf.canvasHeight / conf.canvasWidth;
        if (canvasRatio < conf.formatRatioLimit) {
            return getMediumToLargeScaleProjectionForLandscapeFormat(conf);
        } else if (canvasRatio > 1 / conf.formatRatioLimit) {
            return getMediumToLargeScaleProjectionForPortraitFormat(conf);
        } else {
            // no transition required for square format maps
            projection = ProjectionFactory.createLargeScaleProjection(conf);
            projection.initialize(conf);
            return projection;
        }
    }

    /**
     * Use a section of an azimuthal Lambert graticule to make sure the wedge of
     * the Albers conic projection is not visible at larger scales (i.e., scale > conf.scaleLimit4).
     * Not the central part of the graticule is used, but as conf.scaleLimit4
     * is approached, a section shifted towards the equator is used.
     * When the scale equals conf.scaleLimit4, the upper border of the
     * graticule equals conf.lat0. This ensures that the wedge of
     * the conic Albers projection is not visible on the map. This wedge
     * vertically disects the graticule from lat0 to the closer pole.
     * The shift for the azimuthal projection at scaleLimit4 is computed as follows:
     * First a normal azimuthal Lambert centered on conf.lat0 is initialized.
     * Then the graticule is vertically shifted by half the height of the map.
     * After this shift, the central latitude lat0 is no longer in the center
     * of the map.
     * Then a rotation angle is computed for a spherical rotation that brings
     * the central latitude lat0 again to the center of the map.
     */
    function getShiftedMediumScaleLandscapeProjection(conf) {
        var w, absLat0, azimuthalProj, m, c, y, latLimit, scaleLimit, dy, t, centerLonLat, poleLat;

        azimuthalProj = new LambertAzimuthalEqualAreaOblique();
        azimuthalProj.initialize(conf);

        absLat0 = Math.abs(conf.lat0);

        if (absLat0 > conf.polarLowerLat) {
            // azimuthal projection close to poles needs special treatment
            // an oblique line forming the upper limit for shifting and rotating the
            // azimuthal projection
            m = (conf.polarUpperLat - conf.polarLowerLat) / (conf.scaleLimit4 - conf.scaleLimit3);
            c = conf.polarUpperLat - m * conf.scaleLimit4;
            latLimit = m * conf.mapScale + c;
            if (absLat0 < latLimit) {
                // lat0 is below the oblique line. Use horizontal interpolation
                // between an oblique line (pos. slope) and a vertical line at conf.scaleLimit4
                // position on oblique line at lat0
                scaleLimit = (absLat0 - c) / m;
                w = (conf.mapScale - scaleLimit) / (conf.scaleLimit4 - scaleLimit);
            } else {
                // lat0 is above the oblique line, use normal azimuthal projection (w = 0)
                return azimuthalProj;
            }
        } else if (absLat0 < conf.cylindricalLowerLat) {
            /*
            // FIXME hack: add transformation from azimuthal to cylindrical
            w = (conf.mapScale - conf.scaleLimit3) / (conf.scaleLimit4 - conf.scaleLimit3);
            var cylProj = TransformedLambertAzimuthal.LambertCylindrical();
            cylProj.transformToLambertAzimuthal(w);
            var dy = -w * conf.lat0;
            var rot = (1 - w) * conf.lat0;
            console.log(w, dy, rot);
            return new TransformedProjection(cylProj, dy, Math.PI / 2 - rot, true);
            */
            
             // azimuthal projection close to equator needs special treatment
             // an oblique line forming the lower limit for shifting and rotating the azimuthal projection
             m = -conf.cylindricalLowerLat / (conf.scaleLimit4 - conf.scaleLimit3);
             c = conf.cylindricalLowerLat - m * conf.scaleLimit3;
             y = m * conf.mapScale + c;
             if (absLat0 > y) {
             // lat0 is above the oblique line. Use horizontal interpolation
             // between an oblique line (neg. slope) and a vertical line at conf.scaleLimit4
             scaleLimit = (absLat0 - c) / m;
             w = (conf.mapScale - scaleLimit) / (conf.scaleLimit4 - scaleLimit);
             } else {
             // lat0 is below the oblique line, use normal azimuthal projection (w = 0)
             return azimuthalProj;
             }
        } else {
            // horizontal interpolation between two scales (two vertical lines in the diagram)
            w = (conf.mapScale - (conf.scaleLimit3)) / (conf.scaleLimit4 - conf.scaleLimit3);
        }

        // the conic wedge starts at the center of the map
        // compute half of the map's height and weight the height with scale
        // the graticule is shifted by this distance to hide the conic wedge
        dy = -(conf.topPt[1] - conf.bottomPt[1]) / 2 * w;
        if (conf.lat0 < 0) {
            dy = -dy;
        }

        // compute the geographic coordinates of the center of the map on the shifted graticule
        t = new ShiftedProjection(azimuthalProj, dy);
        centerLonLat = [];
        t.inverse(conf.centerXY[0], conf.centerXY[1], centerLonLat);

        // compute the rotation angle applied to the sphere to recenter the map
        azimuthalProj.initialize({
            lat0 : centerLonLat[1]
        });
        return new ShiftedProjection(azimuthalProj, -dy);
    }

    function create(conf) {
        var projection, landscapeAspectRatio;

        // make sure parameters are inside valid boundaries
        if (conf.lat0 > Math.PI / 2) {
            conf.lat0 = Math.PI / 2;
        } else if (conf.lat0 < -Math.PI / 2) {
            conf.lat0 = -Math.PI / 2;
        }
        // FIXME: test other parameters for valid values

        landscapeAspectRatio = (conf.canvasHeight / conf.canvasWidth) < conf.formatRatioLimit;

        if (conf.mapScale > conf.mercatorLimit2) {
            // use Mercator for largest scales
            projection = new Mercator();
            projection.initialize(conf);
        } else if (conf.mapScale > conf.mercatorLimit1) {
            // blend large scale projection and the Mercator projection (used for largest scales)
            projection = getLargeScaleToMercatorProjection(conf);
        } else if (conf.mapScale > conf.scaleLimit5) {
            // large scale projection
            // for landscape aspects, a Lambert azimuthal, Albers conic or a cylindrical
            // for portrait aspects, a transverse cylindrical
            // for square aspects, a Lambert azimuthal
            projection = ProjectionFactory.createLargeScaleProjection(conf);
            projection.initialize(conf);
        } else if (conf.mapScale > conf.scaleLimit4) {
            // a large scale projection approximating the medium scale projection
            // for landscape aspects, a large scale projection that is vertically shifted to hide the wedge of the conic
            // for portrait aspects, ?
            // for square aspects, a Lambert azimuthal
            projection = getMediumToLargeScaleProjection(conf);
        } else if (conf.mapScale > conf.scaleLimit3 && landscapeAspectRatio && Math.abs(conf.lat0) < conf.polarUpperLat) {
            // only for landscape aspects
            // Lambert azimuthal vertically shifted for a smooth transition to the shifted large scale projection
            projection = getShiftedMediumScaleLandscapeProjection(conf);
        } else if (conf.mapScale >= conf.scaleLimit2) {
            // Lambert azimuthal
            projection = getMediumScaleProjection(conf);
        } else if (conf.mapScale > conf.scaleLimit1) {
            // small-scale projection blended with Lambert azimuthal for medium scale
            projection = getSmallToMediumScaleProjection(conf);
        } else {
            // conf.mapScale < conf.scaleLimit1
            // small-scale projection
            projection = smallScaleTransformation(conf, ProjectionFactory.getSmallScaleProjection(conf.smallScaleProjectionName));
        }
        return projection;
    }

    return create(conf);
};

ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection = function(projection) {
    var xy = [];
    projection.forward(0, Math.PI / 2, xy);
    return xy[1];
};

/**
 * Returns the maximum positive central latitude for a small scale projection
 * with a globe that is not rotated.
 */
ProjectionFactory.smallScaleMaxLat0 = function(mapHeight, proj) {
    var lonLat = [], y;
    // compute the vertical distance in projected coordinates between the equator and
    // the center of the map when the upper border of the map is aligned with the north pole
    // FIXME
    y = ProjectionFactory.halfCentralMeridianLengthOfSmallScaleProjection(proj) - mapHeight;
    proj.inverse(0, y, lonLat);
    return lonLat[1];
};

/**
 * Computes the latitude from which on the azimuthal projection is used for polar areas.
 * If necessary, this latitude limit is moved away from the equator.
 * This is to avoid that the pole is displayed as a line by the conic projection.
 * The polar line would be visible if the pole is shown on the map.
 * All computations are done for the northern hemisphere. The returned latitude is
 * a positive value.
 */
ProjectionFactory.polarLatitudeLimitForAlbersConic = function(topPtY, scale, polarLowerLatLimit, polarUpperLatLimit) {
    if (!polarLowerLatLimit) {
        polarLowerLatLimit = -Math.PI / 2;
    }
    if (!polarUpperLatLimit) {
        polarUpperLatLimit = Math.PI / 2;
    }

    var xy = [];
    var limitLat = polarUpperLatLimit;
    var albersConic = new AlbersConicEqualArea();

    // FIXME: use binary search or Newton-Raphson
    var POL_LAT_INC = 0.1 * Math.PI / 180;
    do {
        // use flattened Albers conic with normal aspect on the north pole, which is
        // equal to the Lambert azimuthal. lat0 is the latitude with the origin of
        // the coordinate system, which will appear in the center of the map.
        albersConic.initialize({
            lat0 : limitLat,
            lat1 : Math.PI / 2,
            lat2 : Math.PI / 2
        });
        albersConic.forward(0, Math.PI / 2, xy);
        limitLat -= POL_LAT_INC;
    } while (xy[1] < topPtY && limitLat > polarLowerLatLimit);
    if (limitLat < polarLowerLatLimit) {
        limitLat = polarLowerLatLimit;
    }
    return limitLat;
};

/**
 * Returns the vertical Y coordinate of the pole in the Albers conic projection.
 * The projection is flattened and centered on a pole, i.e. equal to a polar Lambert
 * azimuthal projection. The coordinate origin is at conf.lat0.
 */
ProjectionFactory.verticalCoordinateOfFlattenedAlbersConicPole = function(conf) {
    var xy = [];
    var conicProj = new AlbersConicEqualArea();
    conicProj.initialize({
        lat0 : conf.lat0,
        lat1 : (conf.lat0 > 0) ? Math.PI / 2 : -Math.PI / 2,
        lat2 : (conf.lat0 > 0) ? Math.PI / 2 : -Math.PI / 2
    });
    conicProj.forward(Math.PI / 2, conf.lat0 > 0 ? Math.PI / 2 : -Math.PI / 2, xy);
    return isNaN(xy[1]) ? 0 : xy[1];
};

ProjectionFactory.createLargeScaleProjection = function(conf) {"use strict";
    var projection, xy = [], canvasRatio = conf.canvasHeight / conf.canvasWidth;
    if (canvasRatio < conf.formatRatioLimit) {
        // landscape format
        // use cylindrical projection for latitudes close to the equator
        if (Math.abs(conf.lat0) < conf.cylindricalLowerLat) {

            projection = new LambertCylindricalEqualArea();
            // compute vertical shift for cylindrical projection
            // such that the central latitude appears in the center of the map.
            projection.forward(0, conf.lat0, xy);
            projection.setVerticalShift(-xy[1]);
            return projection;
        }
        // use azimuthal projection to show poles
        if (Math.abs(conf.lat0) > conf.polarUpperLat) {
            return ProjectionFactory.shiftedLambertAzimuthalPolar(conf);
        }
        // use conic between equator and poles
        return ProjectionFactory.largeScaleAlbersConicForLandscapeFormat(conf);
    } else if (canvasRatio > 1 / conf.formatRatioLimit) {
        // portrait format
        projection = new LambertTransverseCylindricalEqualArea();
        projection.initialize(conf);
        return projection;
    } else {
        // square format
        // FIXME: use faster polar or equatorial equations when close to poles or equator
        projection = new LambertAzimuthalEqualAreaOblique();
        projection.initialize(conf);
        return projection;
    }
};

ProjectionFactory.shiftedLambertAzimuthalPolar = function(conf) {
    var azimuthalProj = new LambertAzimuthalEqualAreaPolar();
    azimuthalProj.initialize(conf);

    // compute vertical shift of the azimuthal projection
    var conicPoleY = ProjectionFactory.verticalCoordinateOfFlattenedAlbersConicPole(conf);
    azimuthalProj.setVerticalShift(conicPoleY - conf.centerXY[1]);

    return azimuthalProj;
};

ProjectionFactory.largeScaleAlbersConicForLandscapeFormat = function(conf) {"use strict";
    var conicProj = new AlbersConicEqualArea();
    var w;

    // adjust lat1 and lat2 in conf
    var topXY = [], bottomXY = [];

    // FIXME make sure polar lines are not visible

    // use an azimuthal projection for finding the latitudes of the upper
    // and lower map border
    var azimuthalProj = new LambertAzimuthalEqualAreaOblique();
    azimuthalProj.initialize(conf);
    azimuthalProj.inverse(conf.topPt[0], conf.topPt[1], topXY);
    azimuthalProj.inverse(conf.bottomPt[0], conf.bottomPt[1], bottomXY);
    var dLat = (topXY[1] - bottomXY[1]) * CONIC_STD_PARALLELS_FRACTION;
    conf.lat1 = topXY[1] - dLat;
    conf.lat2 = bottomXY[1] + dLat;

    if (Math.abs(conf.lat0) < conf.cylindricalUpperLat) {
        // neighboring to cylindrical projection, use conic projection with
        // adjusted standard parallels to blend with cylindrical projection for the equator.
        /*
         * Snyder 1987 Map Projections - A working manual, p. 77:
         * The normal Cylindrical equal-area is the limiting form of
         * the Albers when the equator or two parallels symmetrical
         * about the equator are made standard.
         */
        var dLatTransition = conf.cylindricalUpperLat - conf.cylindricalLowerLat;
        w = (Math.abs(conf.lat0) - conf.cylindricalLowerLat) / dLatTransition;
        conf.lat1 *= w;
        conf.lat2 *= w;
        conicProj.initialize(conf);
        return conicProj;
    }

    if (Math.abs(conf.lat0) > conf.polarLowerLat) {
        // neighboring the azimuthal projection for poles, use conic projection with
        // adjusted standard parallels to blend with the azimuthal projection as
        // lat0 approaches the pole.
        /*
        * Snyder 1987 Map Projections - A working manual, p. 98:
        * If the pole is the only standard parallel, the Albers formulae
        * simplify to provide the polar aspect of the Lambert Azimuthal Equal-Area.
        */
        // adjust the latitude at which the azimuthal projection is used for polar areas,
        // ensuring that the wedge of the conic projection is not visible on the map
        w = (conf.polarUpperLat - Math.abs(conf.lat0)) / (conf.polarUpperLat - conf.polarLowerLat);
        if (conf.lat0 > 0) {
            conf.lat1 = w * conf.lat1 + (1 - w) * Math.PI / 2;
            conf.lat2 = w * conf.lat2 + (1 - w) * Math.PI / 2;
        } else {
            conf.lat1 = w * conf.lat1 - (1 - w) * Math.PI / 2;
            conf.lat2 = w * conf.lat2 - (1 - w) * Math.PI / 2;
        }
        conicProj.initialize(conf);
        return conicProj;
    }

    // use conic projection for intermediate latitudes
    conicProj.initialize(conf);
    // FIXME: test whether pole lines are visible and adjust standard parallels if needed.
    return conicProj;
};
