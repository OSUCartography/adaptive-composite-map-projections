/*globals $, AdaptiveMap, WebGL, ProjectionDiagram, WebGLDebugUtils, resizeCanvasElement, formatLatitude, formatLongitude */

var map,
    INITIAL_MAP_ZOOM = 0.55;

function log(str) {
	"use strict";
	//$('#osu').height(200);
	//$('#osu').append("<p>" + str + "</p>");
}

function isPauseButtonPressed() {
	"use strict";
	var paused = $('#pausePlayButton').attr("class").indexOf("fa-play") !== -1;
	return paused;
}

function playAndUpdateGUI() {
	"use strict";
	var vid = document.getElementById("video1");
	log("start");

	// if current time is at end, start from beginning
	if (vid.currentTime > 0 && vid.currentTime === vid.duration) {
		vid.currentTime = 0;
	}
	if (vid.paused) {
		vid.play();
	}
	$('#pausePlayButton').removeClass('fa-play');
	$('#pausePlayButton').addClass('fa-pause');
}

function pauseAndUpdateGUI() {
	"use strict";
	var vid = document.getElementById("video1");
	log("pause");
	vid.pause();
	$('#pausePlayButton').removeClass('fa-pause');
	$('#pausePlayButton').addClass('fa-play');
}

function togglePlayPause() {
	"use strict";
	var vid = document.getElementById("video1");
	if (vid.paused) {
		playAndUpdateGUI();
	} else {
		pauseAndUpdateGUI();
	}
}

function updateDate(day) {
	"use strict";
	if (isNaN(day)) {
		day = 1;
	}
	// the duration of the video corresponds to 1 year
	// month is zero based, day is one based
	var d = new Date(2006, 0, day),
	// months names for dispaly
	    m_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	document.getElementById('day').innerHTML = d.getDate();
	document.getElementById('month').innerHTML = m_names[d.getMonth()];
	document.getElementById('year').innerHTML = d.getFullYear();
}

function showFail() {
	"use strict";
	$("#failContainer").toggle();
	$("#container").toggle();
}

function iOSversion() {
	if (/iP(hone|od|ad)/.test(navigator.platform)) {
		// supports iOS 2.0 and later: <http://bit.ly/TJjs1V>
		var v = (navigator.appVersion).match(/OS (\d+)_(\d+)_?(\d+)?/);
		return [parseInt(v[1], 10), parseInt(v[2], 10), parseInt(v[3] || 0, 10)];
	}
	return 0;
}

function noCrossOrigin() {
	var src = document.getElementById('videoSourceMP4').src;
	var mp4FileName = src.substring(src.lastIndexOf("/") + 1, src.length);
	document.getElementById('videoSourceMP4').src = "NASA/" + mp4FileName;
	document.getElementById('video1').removeAttribute('crossorigin');
}


$(window).load(function() {
	"use strict";

	var isTouchDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
	    isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent),
	    isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0,
	    isIE = navigator.userAgent.indexOf('MSIE ') > -1 || navigator.userAgent.indexOf('Trident/') > -1,
	    isEdge = navigator.userAgent.indexOf("Edge") > -1,
	// http://stackoverflow.com/questions/7944460/detect-safari-browser
	    isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
	    supportsHTMLVideo = !!document.createElement('video').canPlayType;

	// IE does not compile our GLSL shaders. Hide map, display warning, and return.
	if (isIE || isEdge) {
		document.getElementById("video1").pause();
		$("#ieFailContainer").toggle();
		$("#container").toggle();
		return;
	}

	// hide map if HTML5 video is not available, or if WebGL is not available.
	// iOS version 9 or higher required for WebGL video texture
	if ((isIOS && iOSversion() <= 8) || !WebGL.hasWebGL() || !supportsHTMLVideo) {
		document.getElementById("video1").pause();
		showFail();
		return;
	}

	// Older versions of Safari do not support cross-origin video texture in WebGL on OSX 10.10 and earlier (and also iOS)
	// http://krpano.com/ios/bugs/ios8-webgl-video-cors/
	// use slow same-origin videos on Safari on OS X 10.10 and earlier
	if (isIOS) {
		noCrossOrigin();
	} else if (isMac && isSafari) {
		var osXVersion = /Mac OS X (10[\.\_\d]+)/.exec(navigator.userAgent)[1];
		osXVersion = osXVersion.split("_")[1];
		if (osXVersion <= 10) {
			noCrossOrigin();
		}
	}

	// video autoplay is not available on iOS
	if (isIOS) {
		$("#ioSStartInfo").toggle();
		$("#closeStartInfoButton").toggle();
	}

	function updateZoomSlider() {
		try {
			var mapScale = Math.round(map.getZoomFactor() * 100);
			if ($("#zoom-slider").slider('value') !== mapScale) {
				$("#zoom-slider").slider({
					value : mapScale
				});
			}

			if ($("#zoom-slider").slider('value') > 100) {
				$('#subtitle').animate({
					opacity : 0
				}, {
					queue : false,
					duration : 1000
				});
			} else {
				$('#subtitle').animate({
					opacity : 1
				}, {
					queue : false,
					duration : 1000
				});
			}
		} catch (ignore) {
			// FIXME is called before the slider is initialized
		}
	}

	function projectionChangeListener(map) {
		//console.log(map.updateProjection().toString());
		updateZoomSlider();
	}

	function changeVideoSource(videoSource) {
		var video = document.getElementById('video1');
		var src = document.getElementById('videoSourceMP4').src;
		var root = src.substring(0, src.lastIndexOf("/") + 1);
		src = root + videoSource;

		// http://stackoverflow.com/questions/12151606/setattribute-and-video-src-for-changing-video-tag-source-not-working-in-ie9
		video.pause();
		document.getElementById('videoSourceMP4').src = src + ".mp4";
		document.getElementById('videoSourceWEBM').src = src + ".webm";
		video.setAttribute('crossorigin', 'anonymous');
		video.load();
		playAndUpdateGUI();
	}

	function adjustVideoResolutionToWindowSize() {
		var windowWidth = $(document).width();
		if (windowWidth > 512) {
			$('#mapLayers').multiselect('select', "high", true);
		} else if (windowWidth > 256) {
			$('#mapLayers').multiselect('select', "medium", true);
		} else {
			$('#mapLayers').multiselect('select', "low", true);
		}
	}


	$('#mapLayers').multiselect({
		buttonClass : 'btn btn-link',
		dropRight : true,
		buttonText : function(options, select) {
			return "<i class='fa fa-bars'></i>";
		},
		buttonTitle : function(options, select) {
			return "Map layers and movie resolution";
		},
		onChange : function(option, checked, select) {
			var layerID,
			    videoName = null,
			    video,
			    videoSource;
			video = document.getElementById('video1');

			// make sure one resolution is always selected
			if (checked) {
				switch ($(option).val()) {
				case "xhigh":
					$('#mapLayers').multiselect('deselect', ["high", "medium", "low"]);
					videoName = "2048x1024";
					break;
				case "high":
					$('#mapLayers').multiselect('deselect', ["xhigh", "medium", "low"]);
					videoName = "1024x512";
					break;
				case "medium":
					$('#mapLayers').multiselect('deselect', ["xhigh", "high", "low"]);
					videoName = "512x256";
					break;
				case "low":
					$('#mapLayers').multiselect('deselect', ["xhigh", "high", "medium"]);
					videoName = "256x128";
					break;
				}
			} else {
				// checkbox for video resolution was delesected
				switch ($(option).val()) {
				case "xhigh":
				case "high":
				case "medium":
				case "low":
					adjustVideoResolutionToWindowSize();
					return;
				}
			}
			if (videoName !== null) {
				changeVideoSource(videoName);
			} else {
				// change layer visibility
				if (map !== undefined) {
					layerID = $(option).val();
					if (layerID === "land") {
						map.setLayerVisibility("lakes", checked);
					}
					map.setLayerVisibility(layerID, checked);
				}
			}
		}
	});

	adjustVideoResolutionToWindowSize();

	$("#video1").on("timeupdate", function() {
		var vid = document.getElementById('video1'),
		// the duration of the video corresponds to 365 days
		// note 364 to map from 0..1 to 1..365
		    day = 1 + 364 * vid.currentTime / vid.duration;
		day = Math.round(day);
		// to draw the dial, call trigger(), which also triggers a
		// release event. This would call release and change
		// almost simultaneous when draggin which would create problems,
		// so don't trigger an event while dragging the knob.
		if (!$('#dial').data('videoPausedForDragging')) {
			$('#dial').val(day).trigger('change');
		}
		updateDate(day);
	});
	updateDate(1);

	$("#dial").knob({
		height : 120,

		'mousemove' : function(v) {
			console.log("move");
		},

		// called when the mouse is released, but also when
		// trigger() is called after each video timeupdate event
		'release' : function(v) {
			var vid = document.getElementById('video1');

			if (vid.paused) {
				// set video to new time
				// not division by 364 to scale from 1..365 to 0..1
				vid.currentTime = (v - 1) / 364 * vid.duration;
				$('#dial').data('videoPausedForDragging', false);

				// start video if pause button has not been pressed
				if (!isPauseButtonPressed()) {
					playAndUpdateGUI();
				}
			}
		},

		// called when the dial position is changed by the user
		'change' : function(v) {
			// don't play video while time is adjusted. The currentTime would
			// have to be continuously adjusted while the user changes
			// the dial, but video in Safari and maybe other browsers
			// stops listening when too many commands are sent.
			document.getElementById('video1').pause();
			$('#dial').data('videoPausedForDragging', true);
			updateDate(v);
		},

		'draw' : function() {
			// "tron" case
			if (this.$.data('skin') === 'tron') {

				this.cursorExt = 0.3;

				var a = this.arc(this.cv),
				    pa,
				    i,
				    startAngle,
				    endAngle,
				    r = 1,
				// radius of outter circle
				    outterR = this.radius - this.lineWidth + 1 + this.lineWidth * 2 / 3,
				// width of outter line
				    outterLineWidth = 1.5;

				// circle filling
				this.g.beginPath();
				this.g.arc(this.xy, this.xy, outterR - outterLineWidth / 2, 0, 2 * Math.PI, false);
				this.g.fillStyle = "#222";
				this.g.globalAlpha = "0.5";
				this.g.fill();

				// segmented outter circle
				this.g.lineWidth = outterLineWidth;
				this.g.globalAlpha = "1";
				// increase line width if mouse is over the canvas
				if ($("#dial").data("mouseover") === true) {
					this.g.lineWidth *= 2.5;
				}

				this.g.strokeStyle = this.o.fgColor;
				this.g.lineCap = 'butt';
				for ( i = 0; i < 12; i = i + 1) {
					this.g.beginPath();
					startAngle = i / 12 * Math.PI * 2 + 1 / 180 * Math.PI;
					endAngle = (i + 1) / 12 * Math.PI * 2 - 1 / 180 * Math.PI;
					this.g.arc(this.xy, this.xy, outterR, startAngle, endAngle, false);
					this.g.stroke();
				}

				// previous value arc
				this.g.globalAlpha = "1";
				this.g.lineWidth = this.lineWidth;
				if (this.o.displayPrevious) {
					pa = this.arc(this.v);
					this.g.beginPath();
					this.g.strokeStyle = this.pColor;
					this.g.arc(this.xy, this.xy, this.radius - this.lineWidth, pa.s, pa.e, pa.d);
					this.g.stroke();
				}

				// value arc
				this.g.beginPath();
				this.g.strokeStyle = r ? this.o.fgColor : this.fgColor;
				this.g.arc(this.xy, this.xy, this.radius - this.lineWidth, a.s, a.e, a.d);
				this.g.stroke();

				return false;
			}
		}
	});

	// set flag if mouse is over dial control
	$("#dialContainer").hover(function() {
		$("#dial").data("mouseover", true);
	}, function() {
		$("#dial").data("mouseover", false);
	});

	// make heavily styled elements visible after they have been configured
	$("#controlContainer").show();
	$("#mapLayersButtonContainer").show();

	// create the map
	// use setTimeout to give the browser a chance to render the GUI before the data are loaded
	setTimeout(function() {
		var w = $("#adaptiveMap").width(),
		    h = $("#adaptiveMap").height();
		// for measuring FPS
		// stats = new Stats();
		// stats.setMode( 2 );
		// document.getElementById("FPS").appendChild(stats.domElement);

		map = new AdaptiveMap(document.getElementById('adaptiveMap'), w, h, null, projectionChangeListener /*, stats */);
		map.setZoomFactor(INITIAL_MAP_ZOOM);
		// map.setNumberOfTrianglesAlongEquator(1000);
		map.setForwardRasterProjection(false);
		map.setLayers(getLayers(map)[0]);
		new MapEvents(map);
		map.render(false);
	}, 0);

	// ************************

	$('#infoButton').on("click", function(e) {
		$('#infoContainer').toggle();
		$('#startInfoContainer').hide();
	});

	$('#closeInfoButton').on("click", function(e) {
		$('#infoContainer').hide();
	});

	$('#infoContainer').on("click", function(e) {
		$('#infoContainer').hide();
	});

	$('#pausePlayButton').on("click", function(e) {
		togglePlayPause();
	});

	$("#volumeToggle").on("click", function() {
		var vid = document.getElementById("video1");
		vid.muted = !vid.muted;
		$(this).toggleClass('fa-volume-off fa-volume-up');
	});

	// hide spinning wheel
	$("#video1").on('canplaythrough', function() {
		$("#spinningWheelContainer").hide();
	});
	$("#video1").on('playing', function() {
		$("#spinningWheelContainer").hide();
	});
	$("#video1").on('seeked', function() {
		$("#spinningWheelContainer").hide();
	});
	$("#video1").on('timeupdate', function() {
		$("#spinningWheelContainer").hide();
	});

	// show spinning wheel
	$("#video1").on('stalled', function() {
		$("#spinningWheelContainer").show();
	});

	// change play button when video ends playing
	$("#video1").on('ended', function() {
		$('#pausePlayButton').removeClass('fa-pause');
		$('#pausePlayButton').addClass('fa-play');
		log("ended");
	});

	$(document).on("keypress", function(e) {
		if (e.which === 32) {// space key
			togglePlayPause();
		}
	});

	$("#controlContainer").draggable({
		handle : "#dateContainer",
		containment : "#container",
		scroll : false
	});

	$(".legend").draggable({
		handle : ".colorRamp",
		containment : "#container",
		scroll : false
	});

	$(window).resize(function() {
		map.resizeMap(window.innerWidth, window.innerHeight);
		map.render(false);
	});

	if (isTouchDevice) {
		$(".mouse").toggle();
		$(".touch").toggle();
	}

	// add a zoom slider
	$(function() {
		function action(event, ui) {
			if (map !== undefined && Math.abs(ui.value / 100 - map.getZoomFactor()) > 0.01) {
				map.setZoomFactor(ui.value / 100);
			}
		}


		$("#zoom-slider").slider({
			orientation : "vertical",
			range : "min",
			min : 40,
			max : 150,
			value : INITIAL_MAP_ZOOM * 100,
			change : action,
			slide : action
		});
	});

	// fade out start info after a while, but not on iOS, where the user needs to tap to play video
	/*if (isIOS === false) {
		setTimeout(function() {
			$("#startInfoContainer").fadeOut("slow", function() {
				$("div.mydiv").remove();
			});

		}, 10000);
	}*/

	$('#closeStartInfoButton').on("click", function(e) {
		$('#startInfoContainer').hide();
	});

	$('#startInfoContainer').on("click", function(e) {
		$('#startInfoContainer').hide();
		// video play must be started by user on iOS
		if (isIOS) {
			playAndUpdateGUI();
		}
	});
});
