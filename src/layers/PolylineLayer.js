function PolylineLayer(url, style, scaleVisibility, name) {"use strict";

    PolylineLayer.prototype = new AbstractLayer();
    AbstractLayer.call(this, style, scaleVisibility, name);

    var layer = this;

    this.render = function(fastRender) {

        if (!this.hasOwnProperty("attributes") || !this.hasOwnProperty("geometry")) {
            return;
        }

        // only draw for valid map scale
        if (!this.isVisible()) {
            return;
        }

        var ctx = this.canvas.getContext('2d');
        this.applyStyle(ctx);
        renderPolygons(ctx);
    };

    this.load = function(m) {
        // FIXME use generic data loader

        var map = m, layer = this;
        shapefileReader(url, function(geometry, featureType, attributes) {
            layer.geometry = geometry;
            layer.featureType = featureType;
            layer.attributes = attributes;
            map.render();
        });
    };

    /**
     * Computes two intersection points for a straight line segment that crosses
     * the bounding meridian. Projects and adds the two intersection points and
     * the next end point to a path.
     * @param lonEnd The longitude of the end point of the line segment.
     * @param latEnd The latitude of the end point of the line segment.
     * @param lonStart The longitude of the start point of the line segment.
     * @param latStart The latitude of the start point of the line segment.
     * @param projPath This path will receive three new projected points.
     */

    function projectIntersectingLineTo(lonEnd, latEnd, lonStart, latStart, lon0, lat0, ctx, close, clippedLine) {

        var EPS = 1e-7, dLon, dLat, lon1, lon2, lat1, lat2, xy = [];
        dLat = latEnd - latStart;

        // compute intersection point in geographic coordinates
        // lon1 / lat1 the coordinates of the intermediate end point
        // lon2 / lat2 the coordinates of the intermediate start point

        if (lonStart > Math.PI * 0.500000) {
            // leaving graticule towards east
            dLon = lonEnd - lonStart + 2 * Math.PI;
            lon1 = Math.PI;
            lon2 = -Math.PI;
            if (Math.abs(dLon) < EPS) {
                lat1 = latStart;
                lat2 = latEnd;
            } else {
                lat1 = lat2 = latStart + dLat * (Math.PI - lonStart) / dLon;
            }
        } else if (lonStart < -Math.PI * 0.500000) {
            // leaving graticule towards west
            dLon = lonEnd - lonStart - 2 * Math.PI;
            lon1 = -Math.PI;
            lon2 = Math.PI;
            if (Math.abs(dLon) < EPS) {
                lat1 = latStart;
                lat2 = latEnd;
            } else {
                lat1 = lat2 = latStart + dLat * (-Math.PI - lonStart) / dLon;
            }
        }

        // end the line at the first intermediate point
        layer.projection.forward(lon1, lat1, xy);
        clippedLine.push(lon2);
        clippedLine.push(lat2);
        ctx.lineTo(xy[0], xy[1]);
        /*if (close) {
        // FIXME
        // ctx.closePath();
        }*/

        // start a new line at the second intermediate point
        //layer.projection.forward(lon2, lat2, xy);
        //ctx.moveTo(xy[0], xy[1]);
    }

    function intersectLAT(lonStart, latStart, lonEnd, latEnd) {
        var dLon, dLat, latM, EPS = 1e-7;
        dLat = latEnd - latStart;

        if (lonStart > Math.PI * 0.500000) {
            dLon = lonEnd - lonStart + 2 * Math.PI;
            if (Math.abs(dLon) < EPS) {
                //FIXME
                latM = (latStart + latEnd) / 2;
            } else {
                latM = latStart + dLat * (Math.PI - lonStart) / dLon;
            }
        } else if (lonStart < -Math.PI * 0.500000) {
            dLon = lonEnd - lonStart - 2 * Math.PI;
            if (Math.abs(dLon) < EPS) {
                //FIXME
                latM = (latStart + latEnd) / 2;
            } else {
                latM = latStart + dLat * (-Math.PI - lonStart) / dLon;
            }
        }
        return latM;
    }

    function needsClipping(lonEnd, lonStart) {

        // FIXME
        var K = 0.5, prevRightBorder, nextLeftBorder, prevLeftBorder, nextRightBorder;

        prevRightBorder = lonStart > Math.PI * K;
        nextLeftBorder = lonEnd < -Math.PI * K;
        if (prevRightBorder && nextLeftBorder) {
            return true;
        }
        prevLeftBorder = lonStart < -Math.PI * K;
        nextRightBorder = lonEnd > Math.PI * K;
        if (prevLeftBorder && nextRightBorder) {
            return true;
        }
        return false;
    }

    function goesThroughPole(lonStart, lonEnd) {
        var abs = Math.abs(lonEnd - lonStart);
        if (abs > Math.PI - 1e-5 && abs < Math.PI + 1e-5) {
            return true;
        } else {
            return false;
        }
    }

    function findIntersection(ring, i, lon0, clippedLine, prevLat, latIntersMin, latIntersMax, numbIntersection, step) {
        var pt = [], nCoords, lonStart, latStart, lonEnd, latEnd, polePoint, latM, add, latStep;

        for ( nCoords = ring.length - 2; i < nCoords; i += 2) {
            lonStart = ring[i];
            latStart = ring[i + 1];
            lonEnd = ring[i + 2];
            latEnd = ring[i + 3];

            clippedLine.push(lonStart);
            clippedLine.push(latStart);

            if (needsClipping(lonEnd, lonStart)) {
                latM = intersectLAT(lonStart, latStart, lonEnd, latEnd);
                if (lonStart < 0) {
                    polePoint = -Math.PI;
                    latStep = 1;
                } else {
                    polePoint = Math.PI;
                    latStep = -1;
                }

                if (numbIntersection % 2 === 1 && latStart > 0 && latM === latIntersMax) {
                    //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
                    //adding the points along the meridian (form latM to pole point)
                    for ( add = latM; add < Math.PI / 2; add += step) {
                        clippedLine.push(polePoint);
                        clippedLine.push(add);
                    }
                    //adding the points along the pole line
                    for ( add = polePoint; add * latStep < -polePoint * latStep; add += latStep * step) {
                        clippedLine.push(add);
                        clippedLine.push(Math.PI / 2);
                    }
                    //adding the points along the meridian (from pole point back to latM)
                    for ( add = Math.PI / 2; add > latM; add += -step) {
                        clippedLine.push(-polePoint);
                        clippedLine.push(add);
                    }
                    clippedLine.push(-polePoint);
                    clippedLine.push(latM);
                } else if (numbIntersection % 2 === 1 && latStart < 0 && latM === latIntersMin) {
                    //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
                    //adding the points along the meridian (form latM to pole point)
                    for ( add = latM; add > -Math.PI / 2; add += -step) {
                        clippedLine.push(polePoint);
                        clippedLine.push(add);
                    }
                    //adding the points along the pole line
                    for ( add = polePoint; add * latStep < -polePoint * latStep; add += latStep * step) {
                        clippedLine.push(add);
                        clippedLine.push(-Math.PI / 2);
                    }
                    //adding the points along the meridian (from pole point back to latM)
                    for ( add = -Math.PI / 2; add < latM; add += step) {
                        clippedLine.push(-polePoint);
                        clippedLine.push(add);
                    }
                    clippedLine.push(-polePoint);
                    clippedLine.push(latM);
                } else {
                    return i;
                }
            }
        }
        return -1;
    }

    function needIntermediatePoint(prevXY, XY) {
        var dY, dX, Dmax;

        dX = (prevXY[0] - XY[0]);
        dY = (prevXY[1] - XY[1]);

        Dmax = (dX * dX + dY * dY) * layer.mapScale * layer.mapScale;

        if (Dmax > 9) {
            //console.log("text");
            return true;
        }
        return false;
    }

    function addRefinementPoints(prevLon, prevLat, lon, lat, prevXY, XY, ctx, count, projectedRingGEO, bBox) {
        // FIXME
        //return;

        var latM, lonM, midXY = [], pt = [], MAX_RECURSION = 30;

        if (count < MAX_RECURSION && needIntermediatePoint(prevXY, XY)) {
            //latM = (prevLat + lat) / 2;
            //lonM = (prevLon + lon) / 2;
            PolylineLayer.intermediateGreatCirclePoint(prevLon, prevLat, lon, lat, 0.5, pt);
            latM = pt[1];
            lonM = pt[0];
            layer.projection.forward(lonM, latM, midXY);
            addRefinementPoints(prevLon, prevLat, lonM, latM, prevXY, midXY, ctx, count += 1, projectedRingGEO, bBox);
            storingPolygonPoints(projectedRingGEO, bBox, lon, lat);
            ctx.lineTo(midXY[0], midXY[1]);
            addRefinementPoints(lonM, latM, lon, lat, midXY, XY, ctx, count += 1, projectedRingGEO, bBox);
        }
    }

    function addMeridianPoints(lonArray, latArray, lonFirst, latFirst, prevLatM, step, clippedLine, ctx) {
        //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
        var cutMeridian = Math.PI, newLatM, add, pt = [];
        if (lonArray < 0) {
            cutMeridian = -Math.PI;
        }
        newLatM = intersectLAT(lonArray, latArray, lonFirst, latFirst);
        if (newLatM > prevLatM) {
            for ( add = newLatM; add > prevLatM; add += -step) {
                clippedLine.push(cutMeridian);
                clippedLine.push(add);
            }
            for ( add = prevLatM + step; add < newLatM; add += step) {
                layer.projection.forward(-cutMeridian, add, pt);
                ctx.lineTo(pt[0], pt[1]);
            }
        } else {
            for ( add = newLatM; add < prevLatM; add += step) {
                clippedLine.push(cutMeridian);
                clippedLine.push(add);
            }
            for ( add = prevLatM - step; add > newLatM; add += -step) {
                layer.projection.forward(-cutMeridian, add, pt);
                ctx.lineTo(pt[0], pt[1]);
            }
        }
        layer.projection.forward(-cutMeridian, newLatM, pt);
        ctx.lineTo(pt[0], pt[1]);
        clippedLine.push(cutMeridian);
        clippedLine.push(prevLatM);
    }

    function renderNonIntersectedLines(clippedLines, ctx, projectedRingGEO, bBox) {
        var i, j, line, pt = [], prevXY = [];
        for ( i = 0; i < clippedLines.length; i += 1) {
            line = clippedLines[i];
            layer.projection.forward(line[0], line[1], pt);
            prevXY[0] = pt[0];
            prevXY[1] = pt[1];
            ctx.moveTo(pt[0], pt[1]);
            for ( j = 2; j < line.length; j += 2) {
                layer.projection.forward(line[j], line[j + 1], pt);
                addRefinementPoints(line[j - 2], line[j - 1], line[j], line[j + 1], prevXY, pt, ctx, 0, projectedRingGEO, bBox);
                ctx.lineTo(pt[0], pt[1]);
                prevXY[0] = pt[0];
                prevXY[1] = pt[1];
            }
        }
    }

    function storingPolygonPoints(projectedRingGEO, bBox, lon, lat) {
        if (lon > bBox.xMax) {
            bBox.xMax = lon;
        }
        if (lon < bBox.xMin) {
            bBox.xMin = lon;
        }
        if (lat > bBox.yMax) {
            bBox.yMax = lat;
        }
        if (lat < bBox.yMin) {
            bBox.yMin = lat;
        }
        projectedRingGEO.push(lon);
        projectedRingGEO.push(lat);
    }

    /**
     * Returns 1 if there is an intersections between a closed ring and a ray starting at x / y and 0 otherwise.
     * http://paulbourke.net/geometry/insidepoly/
     */
    function hasRingRayIntersection(ring, x, y) {
        var i, j, nCoords, x1, y1, x2, y2, c;
        c = 0;
        for ( i = 0, nCoords = ring.length, j = ring.length - 2; i < nCoords; j = i, i += 2) {
            x1 = ring[i];
            y1 = ring[i + 1];
            x2 = ring[j];
            y2 = ring[j + 1];
            if ((((y1 <= y) && (y < y2)) || ((y2 <= y) && (y < y1))) && (x < (x2 - x1) * (y - y1) / (y2 - y1) + x1)) {
                c = !c;
            }
        }
        return c;
    }

    /**
     * Returns true if the point at x / y is inside the passed shape. Holes and islands
     * are taken into account.
     */
    function isPointInShape(ring, bBox, lon, lat) {
        var i, j, nCoords, x1, y1, x2, y2, nIntersections = 0;

        if (lon < bBox.xMin || lon > bBox.xMax || lat < bBox.yMin || lat > bBox.yMax) {
            return false;
        }

        for ( i = 0, nCoords = ring.length, j = ring.length - 2; i < nCoords; j = i, i += 2) {
            x1 = ring[i];
            y1 = ring[i + 1];
            x2 = ring[j];
            y2 = ring[j + 1];
            if ((((y1 <= lat) && (lat < y2)) || ((y2 <= lat) && (lat < y1))) && (lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1)) {
                nIntersections = !nIntersections;
            }
        }
        return nIntersections;

    }

    function renderRing(ctx, ring, close) {

        var rotatedRing = [], pt = [], i, nCoords, lon, lat, lon0, lat0, inc, prevLon, prevLat, lonStart, latStart, clippedLines = [], clippedLine;

        var numbIntersection = 0, latInters = [], latM, latIntersMax = -Math.PI / 2, latIntersMin = Math.PI / 2, trash = [], polePoint, add, sign, latStep, prevXY = [], j;

        var projectedRingGEO = [], bBox = {
            xMin : Math.PI * 2,
            xMax : -Math.PI,
            yMin : Math.PI,
            yMax : -Math.PI
        };

        var step = 2 / 180 * Math.PI;
        //layer.projection.inverse(0, 1 / layer.mapScale, pt);
        //var step = pt[1];

        var azimuthalProj = false, latM2, addAzimuthalCircle = false;
        if (layer.projection.toString().indexOf("Azimuthal") !== -1) {
            azimuthalProj = true;
        }

        lon0 = layer.mapCenter.lon0;
        lat0 = layer.mapCenter.lat0;

        var antipodeLon0 = adjlon(lon0 + Math.PI);
        var antipodeLat0 = -layer.mapCenter.lat0;

        lon = ring[ring.length - 2];
        lat = ring[ring.length - 1];
        lon = adjlon(lon - lon0);
        if (layer.rotation) {
            layer.rotation.transform(lon, lat, pt);
            prevLon = pt[0];
            prevLat = pt[1];
        } else {
            prevLon = lon;
            prevLat = lat;
        }

        // loop over all points to count the number of intersections with the border meridian
        for ( i = 0, nCoords = ring.length; i < nCoords; i += 2) {
            lon = ring[i];
            lat = ring[i + 1];

            // apply rotation
            lon = adjlon(lon - lon0);
            if (layer.rotation) {
                layer.rotation.transform(lon, lat, pt);
                lon = pt[0];
                lat = pt[1];
            }

            // test if the current line segment intersects with the border meridian
            if (close && needsClipping(lon, prevLon)) {
                // increase number of intersections
                numbIntersection += 1;

                // store the minimum and maximum latitude of the intersection
                latM = intersectLAT(prevLon, prevLat, lon, lat);
                if (latM < latIntersMin) {
                    latIntersMin = latM;
                }
                if (latM > latIntersMax) {
                    latIntersMax = latM;
                }
            }

            // special case for line segment that crosses a pole
            if (goesThroughPole(prevLon, lon)) {
                console.log("found line section crossing pole");

                if (prevLat > 0) {
                    if (lat > prevLat - Math.PI / 2) {
                        polePoint = Math.PI / 2;
                    } else {
                        polePoint = -Math.PI / 2;
                    }
                } else {
                    if (lat < prevLat + Math.PI / 2) {
                        polePoint = -Math.PI / 2;
                    } else {
                        polePoint = Math.PI / 2;
                    }
                }
                //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
                //adding the points along the meridian (form latM to pole point)
                if (polePoint < 0) {
                    sign = -1;
                } else {
                    sign = 1;
                }
                for ( add = prevLat; add * sign < polePoint * sign; add += sign * step) {
                    rotatedRing.push(prevLon);
                    rotatedRing.push(add);
                }

                if (prevLon < 0) {
                    latStep = -1;
                } else {
                    latStep = 1;
                }
                for ( add = prevLon; add * latStep > lon * latStep; add += -step * latStep) {
                    rotatedRing.push(add);
                    rotatedRing.push(polePoint);
                }

                for ( add = polePoint; add * sign > lat * sign; add += -sign * step) {
                    rotatedRing.push(lon);
                    rotatedRing.push(add);
                }
            }// END special case for line segment that crosses a pole

            // store rotated spherical coordinates
            rotatedRing.push(lon);
            rotatedRing.push(lat);

            prevLon = lon;
            prevLat = lat;
        }

        // transform first point and start drawing a new line
        prevLon = lon = rotatedRing[0];
        prevLat = lat = rotatedRing[1];
        layer.projection.forward(lon, lat, pt);

        // store rotated spherical coordinates of drawn and pojected points in a ring that will
        // also contain additional intermediate points.
        storingPolygonPoints(projectedRingGEO, bBox, lon, lat);
        ctx.moveTo(pt[0], pt[1]);
        prevXY[0] = pt[0];
        prevXY[1] = pt[1];

        // find polar latitude of potential pole box
        // finding minimum to the pole
        if ((Math.PI / 2 - latIntersMax) < (latIntersMin + Math.PI / 2)) {
            latIntersMin = Math.PI / 2;
        } else {
            latIntersMax = -Math.PI / 2;
        }

        // loop over all points for drawing
        for ( i = 2, nCoords = rotatedRing.length; i < nCoords; i += 0) {
            lon = rotatedRing[i];
            lat = rotatedRing[i + 1];

            // test
            if (needsClipping(lon, prevLon)) {
                latM = intersectLAT(prevLon, prevLat, lon, lat);
                polePoint = Math.PI;
                if (prevLon < 0) {
                    polePoint = -Math.PI;
                }
                if (!azimuthalProj && close && numbIntersection % 2 === 1 && prevLat > 0 && latM === latIntersMax) {
                    latStep = -1;
                    if (prevLon < 0) {
                        latStep = 1;
                    }
                    //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
                    //adding the points along the meridian (form latM to pole point)
                    for ( add = latM; add < Math.PI / 2; add += step) {
                        layer.projection.forward(polePoint, add, pt);
                        ctx.lineTo(pt[0], pt[1]);
                    }
                    //adding the points along the pole line
                    for ( add = polePoint; add * latStep < -polePoint * latStep; add += latStep * step) {
                        layer.projection.forward(add, Math.PI / 2, pt);
                        ctx.lineTo(pt[0], pt[1]);
                    }
                    //adding the points along the meridian (from pole point back to latM)
                    for ( add = Math.PI / 2; add > latM; add += -step) {
                        layer.projection.forward(-polePoint, add, pt);
                        ctx.lineTo(pt[0], pt[1]);
                    }

                    layer.projection.forward(-polePoint, latM, pt);
                    ctx.lineTo(pt[0], pt[1]);
                    prevLat = latM;
                    prevLon = -polePoint;
                    prevXY[0] = pt[0];
                    prevXY[1] = pt[1];

                } else if (!azimuthalProj && close && numbIntersection % 2 === 1 && prevLat < 0 && latM === latIntersMin) {
                    latStep = -1;
                    if (prevLon < 0) {
                        latStep = 1;
                    }
                    //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
                    //adding the points along the meridian (form latM to pole point)
                    for ( add = latM; add > -Math.PI / 2; add += -step) {
                        layer.projection.forward(polePoint, add, pt);
                        ctx.lineTo(pt[0], pt[1]);
                    }
                    //adding the points along the pole line
                    for ( add = polePoint; add * latStep < -polePoint * latStep; add += latStep * step) {
                        layer.projection.forward(add, -Math.PI / 2, pt);
                        ctx.lineTo(pt[0], pt[1]);
                    }
                    //adding the points along the meridian (from pole point back to latM)
                    for ( add = -Math.PI / 2; add < latM; add += step) {
                        layer.projection.forward(-polePoint, add, pt);
                        ctx.lineTo(pt[0], pt[1]);
                    }

                    layer.projection.forward(-polePoint, latM, pt);
                    ctx.lineTo(pt[0], pt[1]);
                    prevLat = latM;
                    prevLon = -polePoint;
                    prevXY[0] = pt[0];
                    prevXY[1] = pt[1];

                } else if (!azimuthalProj && !close) {
                    //adding the last point on the border meridian
                    layer.projection.forward(polePoint, latM, pt);
                    addRefinementPoints(prevLon, prevLat, polePoint, latM, prevXY, pt, ctx, 0, projectedRingGEO, bBox);
                    ctx.lineTo(pt[0], pt[1]);

                    //starting new line segment on the other side of the border meridian
                    layer.projection.forward(-polePoint, latM, pt);
                    ctx.moveTo(pt[0], pt[1]);
                    prevLon = -polePoint;
                    prevLat = latM;
                    prevXY[0] = pt[0];
                    prevXY[1] = pt[1];
                    /*} else if (azimuthalProj && numbIntersection % 2 === 0) {
                     trash = [];
                     j = findIntersection(rotatedRing, i, lon0, trash, prevLat, latIntersMin, latIntersMax, numbIntersection, step);
                     latM2 = intersectLAT(rotatedRing[j], rotatedRing[j + 1], rotatedRing[j + 2], rotatedRing[j + 3]);
                     if ((latM <= 0 && latM2 >= 0) || (latM >= 0 && latM2 <= 0)) {
                     addAzimuthalCircle = true;
                     }*/
                } else if (!azimuthalProj) {
                    clippedLine = [];
                    projectIntersectingLineTo(lon, lat, prevLon, prevLat, lon0, lat0, ctx, close, clippedLine);
                    i = findIntersection(rotatedRing, i, lon0, clippedLine, prevLat, latIntersMin, latIntersMax, numbIntersection, step);
                    if (i < 0) {
                        return;
                    }

                    lonStart = rotatedRing[i];
                    latStart = rotatedRing[i + 1];

                    i += 2;

                    lon = rotatedRing[i];
                    lat = rotatedRing[i + 1];
                    //FIXME: Set adding points for different projection (cylindrical, with pole line, with curved pole line)
                    addMeridianPoints(lonStart, latStart, lon, lat, latM, step, clippedLine, ctx);
                    prevLat = intersectLAT(lonStart, latStart, lon, lat);
                    if (lon < 0) {
                        prevLon = -Math.PI;
                    } else {
                        prevLon = Math.PI;
                    }
                    layer.projection.forward(prevLon, prevLat, prevXY);
                    //projectIntersectingLineTo(lonStart, latStart, lon, lat, lon0, lat0, ctx, close, clippedLine);
                    clippedLines.push(clippedLine);
                }
            }

            layer.projection.forward(lon, lat, pt);
            addRefinementPoints(prevLon, prevLat, lon, lat, prevXY, pt, ctx, 0, projectedRingGEO, bBox);
            storingPolygonPoints(projectedRingGEO, bBox, lon, lat);
            ctx.lineTo(pt[0], pt[1]);
            prevLon = lon;
            prevLat = lat;
            prevXY[0] = pt[0];
            prevXY[1] = pt[1];
            i += 2;
        }

        if (close) {
            ctx.closePath();
            if (azimuthalProj) {
                if (isPointInShape(projectedRingGEO, bBox, antipodeLon0, antipodeLat0)) {
                    addAzimuthalCircle = true;
                } else if (bBox.xMax > Math.PI && antipodeLon0 < 0) {
                    if (isPointInShape(projectedRingGEO, bBox, antipodeLon0 + 2 * Math.PI, antipodeLat0)) {
                        addAzimuthalCircle = true;
                    }
                } else if (bBox.xMin < -Math.PI && antipodeLon0 > 0) {
                    if (isPointInShape(projectedRingGEO, bBox, antipodeLon0 - 2 * Math.PI, antipodeLat0)) {
                        addAzimuthalCircle = true;
                    }
                } else {
                    addAzimuthalCircle = false;
                }
            } else {
                addAzimuthalCircle = false;
            }

            if (addAzimuthalCircle) {
                ctx.fillStyle = "red";
                ctx.moveTo(0, 2);
                for ( i = 1; i < 360; i += 1) {
                    ctx.lineTo(2 * Math.sin(i / 180 * Math.PI), 2 * Math.cos(i / 180 * Math.PI));
                }
                ctx.closePath();
            }
        }

        renderNonIntersectedLines(clippedLines, ctx, projectedRingGEO, bBox);
    }

    function drawShape(shp, ctx, lineWidthScale) {
        var close, j, nRings;
        if (!shp.rings) {
            return;
        }

        close = (layer.featureType === ShpType.SHAPE_POLYGON);

        ctx.beginPath();
        for ( j = 0, nRings = shp.rings.length; j < nRings; j += 1) {
            renderRing(ctx, shp.rings[j], close);
        }

        // FIXME
        if (style.fillStyle) {
            ctx.fill();
        }

        if (style.strokeStyle) {
            if (lineWidthScale > 0) {
                ctx.lineWidth = layer.lineWidth * lineWidthScale / layer.mapScale;
            }
            ctx.stroke();
        }
    }

    // draw the polygons
    function renderPolygons(ctx) {
        var i, lon0, lonLimit, viewPortBB, nRecords, shp, bb, bbWest, bbEast, visible, lineWidthScale, lineWidthScaleField;

        layer.setupTransformation(ctx);

        lon0 = layer.mapCenter.lon0;
        lonLimit = adjlon(lon0 + Math.PI);

        // a bounding box around the viewport in geographic coordinates. This is not a rectangle on the map,
        // but a spherical quadrilateral, surrounding the map. The east and west coordinates are relative to
        // the central longitude, i.e. the horizontal origin is on lon0
        viewPortBB = layer.visibleGeographicBoundingBoxCenteredOnLon0;

        if (style.hasOwnProperty("AM_lineWidthScaleAtt")) {
            lineWidthScaleField = layer.getAttributeField(style.AM_lineWidthScaleAtt);
        } else {
            lineWidthScaleField = null;
        }

        for ( i = 0, nRecords = layer.geometry.length; i < nRecords; i += 1) {
            /*
             // only draw the feature if the scale is large enough
             if (scaleVisibility && scaleVisibility.featureMinScaleAtt) {
             var featureMinScale = layer.dbfFile.records[i].values[scaleVisibility.featureMinScaleAtt];
             // FIXME
             featureMinScale *= 2;
             if (featureMinScale > layer.zoomFactor) {
             continue;
             }
             }
             */
            shp = layer.geometry[i];
            bb = shp.box;

            // test whether the feature is inside the latitude range of the viewport (in geographic coordinates)
            // features may still entirely be outside the map viewport after projection
            if (bb.yMin > viewPortBB.north || bb.yMax < viewPortBB.south) {
                // FIXME
                continue;
            }

            // test whether the feature is inside the longitude range of the viewport (in geographic coordinates).
            // to be visible, the feature's west or east border must be inside the viewport,
            // or both borders must be outside the viewport and have oposite signs.
            bbWest = adjlon(bb.xMin - lon0);
            bbEast = adjlon(bb.xMax - lon0);
            visible = ((bbWest > viewPortBB.west && bbWest < viewPortBB.east) || (bbEast > viewPortBB.west && bbEast < viewPortBB.east));
            if (!visible) {
                visible = bbWest <= 0 && bbEast >= 0;
            }

            if (visible /* FIXME */) {
                lineWidthScale = 1;
                if (lineWidthScaleField !== null) {
                    // read text from feature attributes
                    lineWidthScale = lineWidthScaleField[i];
                }
                drawShape(shp, ctx, lineWidthScale);
            }
        }
    }

}

PolylineLayer.intermediateGreatCirclePoint = function(lon1, lat1, lon2, lat2, f, pt) {
    var d, A, B, x, y, z, sinDLat, sinDLon, sinD, cosLat1, cosLat2;
    sinDLat = Math.sin(lat1 - lat2);
    sinDLon = Math.sin(lon1 - lon2);
    cosLat1 = Math.cos(lat1);
    cosLat2 = Math.cos(lat2);

    d = 2 * Math.asin(Math.sqrt(sinDLat * sinDLat / 4 + cosLat1 * cosLat2 * sinDLon * sinDLon / 4));
    sinD = Math.sin(d);
    A = Math.sin((1 - f) * d) / sinD;
    B = Math.sin(f * d) / sinD;
    x = A * cosLat1 * Math.cos(lon1) + B * cosLat2 * Math.cos(lon2);
    y = A * cosLat1 * Math.sin(lon1) + B * cosLat2 * Math.sin(lon2);
    z = A * Math.sin(lat1) + B * Math.sin(lat2);
    pt[1] = Math.atan2(z, Math.sqrt(x * x + y * y));
    pt[0] = Math.atan2(y, x);
}; 