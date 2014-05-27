function PointLayer(url, style, scaleVisibility) {"use strict";

    PointLayer.prototype = new AbstractLayer();
    AbstractLayer.call(this, style, scaleVisibility);

    this.drawSquareSymbol = function(ctx, xy, outterD, outterFill, outterStroke, outterLineWidth, innerSymbol) {
        var r = outterD * 0.5, innerD = innerSymbol.d, innerR = innerD * 0.5, x = xy[0], y = xy[1];

        // outter rectangle
        if (outterStroke !== null) {
            ctx.fillRect(x - r, y - r, outterD, outterD);
        }
        if (outterStroke !== null) {
            ctx.strokeRect(x - r, y - r, outterD, outterD);
        }

        // inner rectangle
        if (innerSymbol !== null) {
            ctx.fillStyle = innerSymbol.fill;
            ctx.fillRect(x - innerR, y - innerR, innerD, innerD);
            ctx.fillStyle = outterFill;
        }
        if (innerSymbol !== null) {
            ctx.strokeStyle = innerSymbol.stroke;
            ctx.lineWidth = innerSymbol.lineWidth;
            ctx.strokeRect(x - innerR, y - innerR, innerD, innerD);
            ctx.strokeStyle = outterStroke;
            ctx.lineWidth = outterLineWidth;
        }
    };

    this.drawCircleSymbol = function(ctx, xy, outterD, outterFill, outterStroke, outterLineWidth, innerSymbol) {
        // outter circle
        this.drawCircle(ctx, xy, outterD * 0.5);
        if (outterFill !== null) {
            ctx.fill();
        }
        if (outterStroke !== null) {
            ctx.stroke();
        }

        // inner circle
        if (innerSymbol !== null) {
            this.drawCircle(ctx, xy, innerSymbol.d * 0.5);
            if (innerSymbol.fill !== null) {
                ctx.fillStyle = innerSymbol.fill;
                ctx.fill();
                if (outterFill !== null) {
                    ctx.fillStyle = outterFill;
                }
            }

            if (innerSymbol.stroke !== null) {
                ctx.strokeStyle = innerSymbol.stroke;
                ctx.lineWidth = innerSymbol.lineWidth;
                ctx.stroke();
                if (outterStroke !== null) {
                    ctx.strokeStyle = outterStroke;
                }
                if (outterLineWidth !== null) {
                    ctx.lineWidth = outterLineWidth;
                }
            }
        }
    };

    this.renderPoints = function(ctx) {

        var xy = [], d, innerSymbol, outterFill, outterStroke, outterLineWidth, squareSymbol, i, nRecords, pt, lon, lat, viewPortBB, lon0;
        if (!this.style.hasOwnProperty("AM_symbolDim") || this.style.AM_symbolDim <= 0) {
            return;
        }

        d = AbstractLayer.getScaleInterpolatedValue(this.style.AM_symbolDim, "dim", this.zoomFactor) / this.mapScale;
        outterFill = this.style.hasOwnProperty("fillStyle") ? this.style.fillStyle : null;
        outterStroke = this.style.hasOwnProperty("strokeStyle") ? this.style.strokeStyle : null;
        outterLineWidth = this.style.lineWidth / this.mapScale;
        squareSymbol = this.style.hasOwnProperty("AM_symbolType") && this.style.AM_symbolType === 'square';
        
        // optional nested inner point symbol
        if (this.style.hasOwnProperty("AM_symbolDim2")) {
            innerSymbol = {
                fill : this.style.hasOwnProperty("AM_fillStyle2") ? this.style.AM_fillStyle2 : null,
                stroke : this.style.hasOwnProperty("AM_strokeStyle2") ? this.style.AM_strokeStyle2 : null,
                lineWidth : this.style.hasOwnProperty("AM_lineWidth2") ? this.style.AM_lineWidth2 / this.mapScale : null,
                d : AbstractLayer.getScaleInterpolatedValue(style.AM_symbolDim2, "dim", this.zoomFactor) / this.mapScale
            };
        } else {
            innerSymbol = null;
        }

        this.setupTransformation(ctx);
        lon0 = this.mapCenter.lon0;
        
        // a bounding box around the viewport in geographic coordinates. This is not a rectangle on the map,
        // but a quadrilateral on the sphere, surrounding the map.
        viewPortBB = this.visibleGeographicBoundingBoxCenteredOnLon0;

        for ( i = 0, nRecords = this.geometry.length; i < nRecords; i += 1) {
            pt = this.geometry[i];
            lon = pt.x;
            lat = pt.y;

            // only project the feature if it is inside the viewport (in geographic coordinates)
            // features may still be outside the map viewport after projection
            lon = adjlon(lon - lon0);
            if (!(lat > viewPortBB.north || lat < viewPortBB.south || lon > viewPortBB.east || lon < viewPortBB.west)) {
                this.projection.forward(lon, lat, xy);
                if (squareSymbol) {
                    this.drawSquareSymbol(ctx, xy, d, outterFill, outterStroke, outterLineWidth, innerSymbol);
                } else {
                    this.drawCircleSymbol(ctx, xy, d, outterFill, outterStroke, outterLineWidth, innerSymbol);
                }
            }

        }
    };

    this.applyLabelStyle = function(ctx) {
        var cssFontElements, i, fontSize;

        this.applyStyle(ctx);

        // set styles for text rendering
        if (this.style.AM_labelColor) {
            ctx.fillStyle = this.style.AM_labelColor;
        }
        if (this.style.AM_haloColor) {
            ctx.strokeStyle = this.style.AM_haloColor;
        }
        // replace scaled stroke width with original unscaled halo width
        ctx.lineWidth = this.style.AM_labelHaloWidth;


        if (style.hasOwnProperty("AM_fontSize") && Array.isArray(style.AM_fontSize) && style.AM_fontSize.length > 0) {
            // interpolate scale-dependent font size
            fontSize = AbstractLayer.getScaleInterpolatedValue(style.AM_fontSize, "fontSize", this.zoomFactor);
            ctx.font = this.style.font.replace("#", fontSize.toFixed(1));
        } else {
            // extract font size from css font string
            cssFontElements = this.style.font.split(" ");
            for ( i = 0; i < cssFontElements.length; i += 1) {
                if (cssFontElements[i].endsWith("px")) {
                    fontSize = parseFloat(cssFontElements[i]);
                    break;
                }
            }
        }

        return fontSize;
    };

    // interpolate position of label along label track
    function interpolateLabelPosition(pt) {
        // FIXME place variables at beginning
        if (pt.labelTrack) {
            var track = pt.labelTrack;
            var trackPt = track[track.length - 1];
            if (layer.zoomFactor > trackPt.scale) {
                lon = trackPt.lon;
                lat = trackPt.lat;
            } else {
                var trackPtID;
                for ( trackPtID = track.length - 2; trackPtID >= 0; trackPtID -= 1) {
                    var trackPt1 = track[trackPtID];
                    var scaleLim = trackPt1.scale;
                    if (layer.zoomFactor > scaleLim) {
                        var trackPt2 = track[trackPtID + 1];
                        var w = (layer.zoomFactor - scaleLim) / (trackPt2.scale - trackPt1.scale);
                        lon = (1 - w) * trackPt1.lon + w * trackPt2.lon;
                        lat = (1 - w) * trackPt1.lat + w * trackPt2.lat;
                        break;
                    }
                }
            }
        }
    }

    function alignLabel(ctx, pt, align, offsetX, offsetY, fontSize) {
        switch (align) {
            case "topRight":
                ctx.textAlign = "left";
                ctx.textBaseline = "bottom";
                pt[0] += offsetX;
                pt[1] += offsetY;
                break;
            case "right":
                ctx.textAlign = "left";
                ctx.textBaseline = "middle";
                pt[0] += offsetX * 2;
                break;
            case "bottomRight":
                ctx.textAlign = "left";
                ctx.textBaseline = "bottom";
                pt[0] += offsetX;
                pt[1] -= offsetY + fontSize;
                break;
            case "bottom":
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                pt[1] -= offsetY + fontSize;
                break;
            case "bottomLeft":
                ctx.textAlign = "right";
                ctx.textBaseline = "bottom";
                pt[0] -= offsetX;
                pt[1] -= offsetY + fontSize;
                break;
            case "left":
                ctx.textAlign = "right";
                ctx.textBaseline = "middle";
                pt[0] -= offsetX * 2;
                break;
            case "topLeft":
                ctx.textAlign = "right";
                ctx.textBaseline = "bottom";
                pt[0] -= offsetX;
                pt[1] += offsetY;
                break;
            case "top":
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                pt[1] += offsetY;
                break;
            case "center":
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                break;
            default:
                ctx.textAlign = "left";
                ctx.textBaseline = "alphabetic";
                pt[0] += offsetX;
                pt[1] += offsetY;
        }
    }

    /**
     * Fill and stroke a label, distribute each element in the array on a separate line.
     */
    function drawLabel(ctx, labels, x, y, lineHeight, stroke, fill, fastRender) {
        var l, t;
        for ( l = 0; l < labels.length; l += 1) {
            t = labels[l];

            // add spaces to simulate tracking
            // FIXME this should be done once when loading the data
            //          if (tracking) {
            //                t = t.replace(/(.)/g, trackingReplacementStr)
            //            }

            if (stroke && !fastRender) {
                ctx.strokeText(t, x, -y);
            }
            if (fill) {
                ctx.fillText(t, x, -y);
            }

            y -= lineHeight;
        }
    }


    this.renderLabels = function(ctx, fastRender) {

        var xy = [], label, labelRows, fill, stroke, toUpperCase, lineHeight, tracking, trackingReplacementStr, alignColumn, alignField, align, labelField, lon0, dy, fontSize, offsetX, offsetY, viewPortBB, track, lon, lat, pt, x, y, i, nRecords;

        // appearance
        fill = this.style.hasOwnProperty("AM_labelColor");
        stroke = this.style.hasOwnProperty("AM_haloColor");
        fontSize = this.applyLabelStyle(ctx);
        lineHeight = (style.hasOwnProperty("AM_lineHeight") && this.style.AM_lineHeight > 0) ? this.style.AM_lineHeight : 16;

        // upper case
        toUpperCase = this.style.hasOwnProperty("AM_toUpperCase") && this.style.AM_toUpperCase === true;

        // tracking
        trackingReplacementStr = null;
        if (style.hasOwnProperty("AM_tracking")) {
            trackingReplacementStr = "$1";
            for ( i = 0; i < this.style.AM_tracking; i += 1) {
                trackingReplacementStr += " ";
            }
        }

        // label offset relative to font size
        offsetX = this.style.hasOwnProperty("AM_labelOffsetX") ? this.style.AM_labelOffsetX * fontSize : 0;
        offsetY = this.style.hasOwnProperty("AM_labelOffsetY") ? this.style.AM_labelOffsetY * fontSize : 0;

        // alignment
        // if textAlign is not a valid Canvas property, the value is the name of a feature attribute
        if (["center", "left", "right", "start", "end"].indexOf(style.textAlign) < 0) {
            alignColumn = this.style.textAlign;
        } else {
            alignColumn = null;
        }
        alignField = this.getAttributeField(alignColumn);

        // text
        labelField = this.getAttributeField(style.AM_textProp);

        // projection
        lon0 = this.mapCenter.lon0;
        dy = this.getVerticalShift() * this.mapScale;
        ctx.setTransform(1, 0, 0, 1, this.canvas.width / 2, this.canvas.height / 2 - dy);

        // a bounding box around the viewport in geographic coordinates. This is not a rectangle on the map,
        // but a rectangle on the sphere, surrounding the map.
        viewPortBB = this.visibleGeographicBoundingBoxCenteredOnLon0;

        for ( i = 0, nRecords = this.geometry.length; i < nRecords; i += 1) {

            /*
             FIXME
             var field = getAttributeField(scaleVisibility.featureMinScaleAtt);
             // only draw the feature if the scale is large enough
             if (scaleVisibility && scaleVisibility.featureMinScaleAtt) {
             var featureMinScale = dataRecord.values[scaleVisibility.featureMinScaleAtt];
             if (featureMinScale > layer.zoomFactor) {
             continue;
             }
             }
             */
            pt = this.geometry[i];

            // uncomment to show label track
            // renderMovingLabelTrack(ctx, pt);

            // interpolate position of label along label track
            lon = pt.x;
            lat = pt.y;

            // only draw the point if it is inside the viewport (in geographic coordinates)
            // the point may still be outside the map viewport after projection
            lon = adjlon(lon - lon0);
            if (lat > viewPortBB.north || lat < viewPortBB.south || lon > viewPortBB.east || lon < viewPortBB.west) {
                continue;
            }

            this.projection.forward(lon, lat, xy);
            xy[0] *= this.mapScale;
            xy[1] *= this.mapScale;

            if (alignColumn !== null) {
                align = alignField[i];
                if (align) {
                    // TODO get rid of trim
                    alignLabel(ctx, xy, align.trim(), offsetX, offsetY, fontSize);
                }
            }
            x = xy[0];
            y = xy[1];

            // read text from feature attributes
            label = labelField[i];
           
            // remove empty spaces at end (added by shapefiles)
            // FIXME this should be done once when loading the data
            label = label.trim();

            // FIXME this should be done once when loading the data
            if (toUpperCase) {
                label = label.toUpperCase();
            }

            // split label
            // FIXME this should be done once when loading the data
            labelRows = label.split("#");
            // shift vertically for multi-line labels
            y += lineHeight * (labelRows.length - 1) / 2;

            // vertically distribute labels
            drawLabel(ctx, labelRows, x, y, lineHeight, stroke, fill, fastRender);
        }
    };

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
        this.renderPoints(ctx);
        this.renderLabels(ctx, fastRender);
    };

    this.load = function(m) {
        // FIXME use generic data loader
        
        var map = m, layer = this;
        shapefileReader(url, function(geometry, featureType, attributes) {
            layer.geometry = geometry;
            layer.attributes = attributes;
            extractMovingLabelTracks(geometry, attributes);
            map.render();
        });
    };

    /*
     * Extract tracks along which labels move from the attribute table and add the tracks to the point geometry
     */
    function extractMovingLabelTracks(geometry, attributes) {
        // FIXME move variable to beginning
        var i, j;

        var scaleDependentPlacement = style.AM_positions && Array.isArray(style.AM_positions) && style.AM_positions.length > 0;
        if (!scaleDependentPlacement) {
            return;
        }
        var toRad = Math.PI / 180;
        for ( i = 0, nRecords = geometry.length; i < nRecords; i += 1) {
            var shape = geometry[i];
            var track = [], lon, lat;

            // start point is shape geometry
            track.push({
                scale : scaleVisibility ? scaleVisibility.layerMinScale : 0,
                lon : shape.x,
                lat : shape.y
            });

            // following points are in attribute table
            for ( j = 0; j < style.AM_positions.length; j += 1) {
                var pos = style.AM_positions[j];
                lon = getAttributeField(pos.lon)[i];
                lat = getAttributeField(pos.lat)[i];
                if ((!isNaN(lon - 0) && lon != null) && (!isNaN(lat - 0) && lat != null)) {
                    track.push({
                        scale : pos.scale,
                        lon : lon * toRad,
                        lat : lat * toRad
                    });
                }
            }
            if (track.length > 1) {
                shape.labelTrack = track;
            }
        }
    }

    function renderMovingLabelTrack(ctx, shape) {
        
        // FIXME move variable to beginning
        
        var track = shape.labelTrack, i;
        if (!track) {
            return;
        }
        ctx.save();
        ctx.lineWidth = 2 / layer.mapScale;
        ctx.strokeStyle = "orange";
        Layer.setupTransformation(ctx, layer.projection, layer.mapScale, layer.canvas.width, layer.canvas.height);
        var lon0 = layer.mapCenter.lon0;
        var xy = [];
        var lon = track[0].lon;
        lon = adjlon(lon - lon0);
        layer.projection.forward(lon, track[0].lat, xy);
        ctx.beginPath();
        ctx.moveTo(xy[0], xy[1]);
        for ( i = 1; i < track.length; i += 1) {
            var scaleLim = style.AM_positions[i];
            lon = track[i].lon;
            lon = adjlon(lon - lon0);
            layer.projection.forward(lon, track[i].lat, xy);
            ctx.lineTo(xy[0], xy[1]);
        }
        ctx.stroke();
        ctx.restore();
    }

}