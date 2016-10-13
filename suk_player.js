function audioBufferToWav (buffer, opt) {
  opt = opt || {}

  var numChannels = buffer.numberOfChannels
  var sampleRate = buffer.sampleRate
  var format = opt.float32 ? 3 : 1
  var bitDepth = format === 3 ? 32 : 16

  var result
  if (numChannels === 2) {
    result = interleave(buffer.getChannelData(0), buffer.getChannelData(1))
  } else {
    result = buffer.getChannelData(0)
  }

  return encodeWAV(result, format, sampleRate, numChannels, bitDepth)
}

function encodeWAV (samples, format, sampleRate, numChannels, bitDepth) {
  var bytesPerSample = bitDepth / 8
  var blockAlign = numChannels * bytesPerSample

  var buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
  var view = new DataView(buffer)

  /* RIFF identifier */
  writeString(view, 0, 'RIFF')
  /* RIFF chunk length */
  view.setUint32(4, 36 + samples.length * bytesPerSample, true)
  /* RIFF type */
  writeString(view, 8, 'WAVE')
  /* format chunk identifier */
  writeString(view, 12, 'fmt ')
  /* format chunk length */
  view.setUint32(16, 16, true)
  /* sample format (raw) */
  view.setUint16(20, format, true)
  /* channel count */
  view.setUint16(22, numChannels, true)
  /* sample rate */
  view.setUint32(24, sampleRate, true)
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true)
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true)
  /* bits per sample */
  view.setUint16(34, bitDepth, true)
  /* data chunk identifier */
  writeString(view, 36, 'data')
  /* data chunk length */
  view.setUint32(40, samples.length * bytesPerSample, true)
  if (format === 1) { // Raw PCM
    floatTo16BitPCM(view, 44, samples)
  } else {
    writeFloat32(view, 44, samples)
  }

  return buffer
}

function interleave (inputL, inputR) {
  var length = inputL.length + inputR.length
  var result = new Float32Array(length)

  var index = 0
  var inputIndex = 0

  while (index < length) {
    result[index++] = inputL[inputIndex]
    result[index++] = inputR[inputIndex]
    inputIndex++
  }
  return result
}

function writeFloat32 (output, offset, input) {
  for (var i = 0; i < input.length; i++, offset += 4) {
    output.setFloat32(offset, input[i], true)
  }
}

function floatTo16BitPCM (output, offset, input) {
  for (var i = 0; i < input.length; i++, offset += 2) {
    var s = Math.max(-1, Math.min(1, input[i]))
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }
}

function writeString (view, offset, string) {
  for (var i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

// Last time updated at Fri Jan 08 2016 14:06

// gumadapter.js
// https://cdn.webrtc-experiment.com/gumadapter.js

// getUserMedia hacks from git/webrtc/adapter; 
// removed redundant codes
// A-to-Zee, all copyrights goes to:
// https://github.com/webrtc/adapter/blob/master/LICENSE.md

var getUserMedia = null;
var webrtcDetectedBrowser = null;
var webrtcDetectedVersion = null;
var webrtcMinimumVersion = null;

var webrtcUtils = window.webrtcUtils || {};
if(!webrtcUtils.enableLogs) {
    webrtcUtils.enableLogs = true;
}
if(!webrtcUtils.log) {
    webrtcUtils.log = function() {
        if(!webrtcUtils.enableLogs) {
            return;
        }

        // suppress console.log output when being included as a module.
        if (typeof module !== 'undefined' ||
            typeof require === 'function' && typeof define === 'function') {
            return;
        }
        console.log.apply(console, arguments);
    };
}

if(!webrtcUtils.extractVersion) {
    webrtcUtils.extractVersion = function(uastring, expr, pos) {
        var match = uastring.match(expr);
        return match && match.length >= pos && parseInt(match[pos], 10);
    };
}

if (typeof window === 'object') {
  if (window.HTMLMediaElement &&
    !('srcObject' in window.HTMLMediaElement.prototype)) {
    // Shim the srcObject property, once, when HTMLMediaElement is found.
    Object.defineProperty(window.HTMLMediaElement.prototype, 'srcObject', {
      get: function() {
        // If prefixed srcObject property exists, return it.
        // Otherwise use the shimmed property, _srcObject
        return 'mozSrcObject' in this ? this.mozSrcObject : this._srcObject;
      },
      set: function(stream) {
        if ('mozSrcObject' in this) {
          this.mozSrcObject = stream;
        } else {
          // Use _srcObject as a private property for this shim
          this._srcObject = stream;
          // TODO: revokeObjectUrl(this.src) when !stream to release resources?
          this.src = stream ? URL.createObjectURL(stream) : null;
        }
      }
    });
  }
  // Proxy existing globals
  getUserMedia = window.navigator && window.navigator.getUserMedia;
}

if (typeof window === 'undefined' || !window.navigator) {
    webrtcDetectedBrowser = 'not a browser';
} else if (navigator.mozGetUserMedia && window.mozRTCPeerConnection) {
    webrtcDetectedBrowser = 'firefox';

    // the detected firefox version.
    webrtcDetectedVersion = webrtcUtils.extractVersion(navigator.userAgent,
        /Firefox\/([0-9]+)\./, 1);

    // the minimum firefox version still supported by adapter.
    webrtcMinimumVersion = 31;

    // getUserMedia constraints shim.
    getUserMedia = function(constraints, onSuccess, onError) {
        var constraintsToFF37 = function(c) {
            if (typeof c !== 'object' || c.require) {
                return c;
            }
            var require = [];
            Object.keys(c).forEach(function(key) {
                if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
                    return;
                }
                var r = c[key] = (typeof c[key] === 'object') ?
                    c[key] : {
                        ideal: c[key]
                    };
                if (r.min !== undefined ||
                    r.max !== undefined || r.exact !== undefined) {
                    require.push(key);
                }
                if (r.exact !== undefined) {
                    if (typeof r.exact === 'number') {
                        r.min = r.max = r.exact;
                    } else {
                        c[key] = r.exact;
                    }
                    delete r.exact;
                }
                if (r.ideal !== undefined) {
                    c.advanced = c.advanced || [];
                    var oc = {};
                    if (typeof r.ideal === 'number') {
                        oc[key] = {
                            min: r.ideal,
                            max: r.ideal
                        };
                    } else {
                        oc[key] = r.ideal;
                    }
                    c.advanced.push(oc);
                    delete r.ideal;
                    if (!Object.keys(r).length) {
                        delete c[key];
                    }
                }
            });
            if (require.length) {
                c.require = require;
            }
            return c;
        };
        if (webrtcDetectedVersion < 38) {
            webrtcUtils.log('spec: ' + JSON.stringify(constraints));
            if (constraints.audio) {
                constraints.audio = constraintsToFF37(constraints.audio);
            }
            if (constraints.video) {
                constraints.video = constraintsToFF37(constraints.video);
            }
            webrtcUtils.log('ff37: ' + JSON.stringify(constraints));
        }
        return navigator.mozGetUserMedia(constraints, onSuccess, onError);
    };

    navigator.getUserMedia = getUserMedia;

    // Shim for mediaDevices on older versions.
    if (!navigator.mediaDevices) {
        navigator.mediaDevices = {
            getUserMedia: requestUserMedia,
            addEventListener: function() {},
            removeEventListener: function() {}
        };
    }
    navigator.mediaDevices.enumerateDevices =
        navigator.mediaDevices.enumerateDevices || function() {
            return new Promise(function(resolve) {
                var infos = [{
                    kind: 'audioinput',
                    deviceId: 'default',
                    label: '',
                    groupId: ''
                }, {
                    kind: 'videoinput',
                    deviceId: 'default',
                    label: '',
                    groupId: ''
                }];
                resolve(infos);
            });
        };

    if (webrtcDetectedVersion < 41) {
        // Work around http://bugzil.la/1169665
        var orgEnumerateDevices =
            navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
        navigator.mediaDevices.enumerateDevices = function() {
            return orgEnumerateDevices().then(undefined, function(e) {
                if (e.name === 'NotFoundError') {
                    return [];
                }
                throw e;
            });
        };
    }

} else if (navigator.webkitGetUserMedia && window.webkitRTCPeerConnection) {
    webrtcDetectedBrowser = 'chrome';

    webrtcDetectedVersion = webrtcUtils.extractVersion(navigator.userAgent,
        /Chrom(e|ium)\/([0-9]+)\./, 2);

    // the minimum chrome version still supported by adapter.
    webrtcMinimumVersion = 38;

    // getUserMedia constraints shim.
    var constraintsToChrome = function(c) {
        if (typeof c !== 'object' || c.mandatory || c.optional) {
            return c;
        }
        var cc = {};
        Object.keys(c).forEach(function(key) {
            if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
                return;
            }
            var r = (typeof c[key] === 'object') ? c[key] : {
                ideal: c[key]
            };
            if (r.exact !== undefined && typeof r.exact === 'number') {
                r.min = r.max = r.exact;
            }
            var oldname = function(prefix, name) {
                if (prefix) {
                    return prefix + name.charAt(0).toUpperCase() + name.slice(1);
                }
                return (name === 'deviceId') ? 'sourceId' : name;
            };
            if (r.ideal !== undefined) {
                cc.optional = cc.optional || [];
                var oc = {};
                if (typeof r.ideal === 'number') {
                    oc[oldname('min', key)] = r.ideal;
                    cc.optional.push(oc);
                    oc = {};
                    oc[oldname('max', key)] = r.ideal;
                    cc.optional.push(oc);
                } else {
                    oc[oldname('', key)] = r.ideal;
                    cc.optional.push(oc);
                }
            }
            if (r.exact !== undefined && typeof r.exact !== 'number') {
                cc.mandatory = cc.mandatory || {};
                cc.mandatory[oldname('', key)] = r.exact;
            } else {
                ['min', 'max'].forEach(function(mix) {
                    if (r[mix] !== undefined) {
                        cc.mandatory = cc.mandatory || {};
                        cc.mandatory[oldname(mix, key)] = r[mix];
                    }
                });
            }
        });
        if (c.advanced) {
            cc.optional = (cc.optional || []).concat(c.advanced);
        }
        return cc;
    };

    getUserMedia = function(constraints, onSuccess, onError) {
        if (constraints.audio) {
            constraints.audio = constraintsToChrome(constraints.audio);
        }
        if (constraints.video) {
            constraints.video = constraintsToChrome(constraints.video);
        }
        webrtcUtils.log('chrome: ' + JSON.stringify(constraints));
        return navigator.webkitGetUserMedia(constraints, onSuccess, onError);
    };
    navigator.getUserMedia = getUserMedia;

    if (!navigator.mediaDevices) {
        navigator.mediaDevices = {
            getUserMedia: requestUserMedia
        };
    }

    // A shim for getUserMedia method on the mediaDevices object.
    // TODO(KaptenJansson) remove once implemented in Chrome stable.
    if (!navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia = function(constraints) {
            return requestUserMedia(constraints);
        };
    } else {
        // Even though Chrome 45 has navigator.mediaDevices and a getUserMedia
        // function which returns a Promise, it does not accept spec-style
        // constraints.
        var origGetUserMedia = navigator.mediaDevices.getUserMedia.
        bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = function(c) {
            webrtcUtils.log('spec:   ' + JSON.stringify(c)); // whitespace for alignment
            c.audio = constraintsToChrome(c.audio);
            c.video = constraintsToChrome(c.video);
            webrtcUtils.log('chrome: ' + JSON.stringify(c));
            return origGetUserMedia(c);
        };
    }

    // Dummy devicechange event methods.
    // TODO(KaptenJansson) remove once implemented in Chrome stable.
    if (typeof navigator.mediaDevices.addEventListener === 'undefined') {
        navigator.mediaDevices.addEventListener = function() {
            webrtcUtils.log('Dummy mediaDevices.addEventListener called.');
        };
    }
    if (typeof navigator.mediaDevices.removeEventListener === 'undefined') {
        navigator.mediaDevices.removeEventListener = function() {
            webrtcUtils.log('Dummy mediaDevices.removeEventListener called.');
        };
    }

} else if (navigator.mediaDevices && navigator.userAgent.match(/Edge\/(\d+).(\d+)$/)) {
    webrtcUtils.log('This appears to be Edge');
    webrtcDetectedBrowser = 'edge';

    webrtcDetectedVersion = webrtcUtils.extractVersion(navigator.userAgent, /Edge\/(\d+).(\d+)$/, 2);

    // the minimum version still supported by adapter.
    webrtcMinimumVersion = 12;
} else {
    webrtcUtils.log('Browser does not appear to be WebRTC-capable');
}

// Returns the result of getUserMedia as a Promise.
function requestUserMedia(constraints) {
    return new Promise(function(resolve, reject) {
        getUserMedia(constraints, resolve, reject);
    });
}

if (typeof module !== 'undefined') {
    module.exports = {
        getUserMedia: getUserMedia,
        webrtcDetectedBrowser: webrtcDetectedBrowser,
        webrtcDetectedVersion: webrtcDetectedVersion,
        webrtcMinimumVersion: webrtcMinimumVersion,
        webrtcUtils: webrtcUtils
    };
} else if ((typeof require === 'function') && (typeof define === 'function')) {
    // Expose objects and functions when RequireJS is doing the loading.
    define([], function() {
        return {
            getUserMedia: getUserMedia,
            webrtcDetectedBrowser: webrtcDetectedBrowser,
            webrtcDetectedVersion: webrtcDetectedVersion,
            webrtcMinimumVersion: webrtcMinimumVersion,
            webrtcUtils: webrtcUtils
        };
    });
}
function MediaElements(_initParams){
	var filters = [],
		audioContext;
	
	function getUserMediaClass(){
		navigator.getUserMedia = 
			navigator.getUserMedia ||
			(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)|| 
			navigator.webkitGetUserMedia ||
			navigator.mozGetUserMedia || 
			navigator.msGetUserMedia;
		return navigator.getUserMedia;
	}
	
	function getAudioContextClass(){
		if(audioContext){
			return audioContext;
		}
		var contextClass = (window.AudioContext ||
		  window.webkitAudioContext ||
		  window.mozAudioContext ||
		  window.oAudioContext ||
		  window.msAudioContext);
		
		if (contextClass) {
			audioContext = new contextClass();
		} 
		return audioContext;
	}
	function createFilters() {
		if(!audioContext){
			return [];
		}
		function createFilter (frequency) {
			var filter = audioContext.createBiquadFilter();
			filter.type = 'peaking';
			filter.frequency.value = frequency;
			filter.Q.value = 1;
			filter.gain.value = 0;
			return filter;
		};
		var frequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
		var filters = frequencies.map(createFilter);
		filters.reduce(function (prev, curr) {
			prev.connect(curr);
			return curr;
		});
		return filters;
	};
	function getFilters(){
		return filters;
	}
	function getDevices(callback){	
		checkDeviceSupport(function(){
			var result = {
				audioContext : getAudioContextClass(),
				
				getUserMedia: getUserMediaClass(),
				
				hasMicrophone : hasMicrophone,
				hasSpeakers:hasSpeakers,
				hasWebcam:hasWebcam,

				isWebsiteHasMicrophonePermissions:isWebsiteHasMicrophonePermissions,
				isWebsiteHasWebcamPermissions:isWebsiteHasWebcamPermissions
			};
			callback&&callback(result);
		})	
	}
	var MediaDevices = [];
	var audioInputDevices = [];
	var audioOutputDevices = [];
	var videoInputDevices = [];

	if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
		// Firefox 38+ seems having support of enumerateDevices
		// Thanks @xdumaine/enumerateDevices
		navigator.enumerateDevices = function(callback) {
			navigator.mediaDevices.enumerateDevices().then(callback);
		};
	}

	// ---------- Media Devices detection
	var canEnumerate = false;

	/*global MediaStreamTrack:true */
	if (typeof MediaStreamTrack !== 'undefined' && 'getSources' in MediaStreamTrack) {
		canEnumerate = true;
	} else if (navigator.mediaDevices && !!navigator.mediaDevices.enumerateDevices) {
		canEnumerate = true;
	}

	var hasMicrophone = false;
	var hasSpeakers = false;
	var hasWebcam = false;

	var isWebsiteHasMicrophonePermissions = false;
	var isWebsiteHasWebcamPermissions = false;

	// http://dev.w3.org/2011/webrtc/editor/getusermedia.html#mediadevices
	// todo: switch to enumerateDevices when landed in canary.
	function checkDeviceSupport(callback) {
		if (!canEnumerate) {
			callback&&callback();
			return;
		}

		// This method is useful only for Chrome!

		if (!navigator.enumerateDevices && window.MediaStreamTrack && window.MediaStreamTrack.getSources) {
			navigator.enumerateDevices = window.MediaStreamTrack.getSources.bind(window.MediaStreamTrack);
		}

		if (!navigator.enumerateDevices && navigator.enumerateDevices) {
			navigator.enumerateDevices = navigator.enumerateDevices.bind(navigator);
		}

		if (!navigator.enumerateDevices) {
			if (callback) {
				callback();
			}
			return;
		}

		MediaDevices = [];

		audioInputDevices = [];
		audioOutputDevices = [];
		videoInputDevices = [];

		navigator.enumerateDevices(function(devices) {
			devices.forEach(function(_device) {
				var device = {};
				for (var d in _device) {
					device[d] = _device[d];
				}

				// if it is MediaStreamTrack.getSources
				if (device.kind === 'audio') {
					device.kind = 'audioinput';
				}

				if (device.kind === 'video') {
					device.kind = 'videoinput';
				}

				var skip;
				MediaDevices.forEach(function(d) {
					if (d.id === device.id && d.kind === device.kind) {
						skip = true;
					}
				});

				if (skip) {
					return;
				}

				if (!device.deviceId) {
					device.deviceId = device.id;
				}

				if (!device.id) {
					device.id = device.deviceId;
				}
				if (!device.label) {
					device.label = 'Please invoke getUserMedia once.';
					if (location.protocol !== 'https:') {
						if (document.domain.search && document.domain.search(/localhost|127.0./g) === -1) {
							device.label = 'HTTPs is required to get label of this ' + device.kind + ' device.';
						}
					}
				} else {
					if (device.kind === 'videoinput' && !isWebsiteHasWebcamPermissions) {
						isWebsiteHasWebcamPermissions = true;
					}

					if (device.kind === 'audioinput' && !isWebsiteHasMicrophonePermissions) {
						isWebsiteHasMicrophonePermissions = true;
					}
				}

				if (device.kind === 'audioinput') {
					hasMicrophone = true;

					if (audioInputDevices.indexOf(device) === -1) {
						audioInputDevices.push(device);
					}
				}

				if (device.kind === 'audiooutput') {
					hasSpeakers = true;

					if (audioOutputDevices.indexOf(device) === -1) {
						audioOutputDevices.push(device);
					}
				}

				if (device.kind === 'videoinput') {
					hasWebcam = true;

					if (videoInputDevices.indexOf(device) === -1) {
						videoInputDevices.push(device);
					}
				}

				// there is no 'videoouput' in the spec.

				if (MediaDevices.indexOf(device) === -1) {
					MediaDevices.push(device);
				}
			});

			if (typeof DetectRTC !== 'undefined') {
				// to sync latest outputs
				DetectRTC.MediaDevices = MediaDevices;
				DetectRTC.hasMicrophone = hasMicrophone;
				DetectRTC.hasSpeakers = hasSpeakers;
				DetectRTC.hasWebcam = hasWebcam;

				DetectRTC.isWebsiteHasWebcamPermissions = isWebsiteHasWebcamPermissions;
				DetectRTC.isWebsiteHasMicrophonePermissions = isWebsiteHasMicrophonePermissions;

				DetectRTC.audioInputDevices = audioInputDevices;
				DetectRTC.audioOutputDevices = audioOutputDevices;
				DetectRTC.videoInputDevices = videoInputDevices;
			}

			if (callback) {
				callback();
			}
		});
	}

	// check for microphone/camera support!
	checkDeviceSupport();

	return{
		getAudioContextClass:getAudioContextClass,
		getUserMediaClass:getUserMediaClass,
		createFilters:createFilters,
		getFilters:getFilters,
		getDevices:getDevices
		
	}
};

function PitchPlayer(_initParams){
	var 
		initParams = _initParams||{},
		BUFFER_SIZE = initParams.BUFFER_SIZE,
		audioNode,
		samples = new Float32Array(BUFFER_SIZE * 2),
		soundBuffer,
		blob,
		soundTouch,
		simpleFilter,
		lastPosition,
		playingInterval,
		ticksTotal,
		currentTick,
		soundTouchSource = {
			extract: function (target, numFrames, position) {
				var l = soundBuffer.getChannelData(0);
				if (soundBuffer.numberOfChannels > 1){
					var r = soundBuffer.getChannelData(1);
				} else {
					var r = soundBuffer.getChannelData(0);
				}
				for (var i = 0; i < numFrames; i++) {
					target[i * 2] = l[i + position];
					target[i * 2 + 1] = r[i + position];
				}
				return Math.min(numFrames, l.length - position);
			}
		};

	function stopPlayingInterval(){
		clearInterval(playingInterval);
	}
	function startPlayingInterval(){
		stopPlayingInterval();
		var startDateTime = new Date().getTime();
		playingInterval = setInterval(function(){
			var correction = new Date().getTime() - startDateTime;
			initParams.onPlay&&initParams.onPlay(lastPosition,soundBuffer.duration, correction);
		},100);
	}
	
	function onAudioProcess (e){
		// The input buffer is the song we loaded earlier
		var inputBuffer = e.inputBuffer;

		// The output buffer contains the samples that will be modified and played
		var outputBuffer = e.outputBuffer;

		for (var channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
			var inputData = inputBuffer.getChannelData(channel);
			var outputData = outputBuffer.getChannelData(channel);

			// Loop through the 4096 samples
			for (var sample = 0; sample < inputBuffer.length; sample++) {
				// make output equal to the same as the input
				outputData[sample] = inputData[sample];
				// add noise to each output sample
				//outputData[sample] += ((Math.random() * 2) - 1) * 0.01; 				
			}
		}
		currentTick++;
		var position = (currentTick/ticksTotal);
		//console.log(position)
		initParams.onPlay&&initParams.onPlay(position,soundBuffer.duration);
	}
	function onPitchAudioProcess (e){
		//if (soundBuffer.getChannelData){
			//pos+=BUFFER_SIZE / audioContext.sampleRate;
			var l = e.outputBuffer.getChannelData(0);
			var r = e.outputBuffer.getChannelData(1);
			
			var framesExtracted = simpleFilter.extract(samples, BUFFER_SIZE);
			for (var i = 0; i < framesExtracted; i++) {
				l[i] = samples[i * 2];
				r[i] = samples[i * 2 + 1];
				//console.log()
			}
			var position = simpleFilter.sourcePosition / (soundBuffer.duration * initParams.audioContext.sampleRate);
			if (lastPosition!=position){
				lastPosition = position;
				initParams.onPlay&&initParams.onPlay(position,soundBuffer.duration);
				startPlayingInterval();
			}
			//leftchannel.push (new Float32Array (l));
			//rightchannel.push (new Float32Array (r));
			//blob = new Blob([e.data], {
            //    type: e.data.type || config.mimeType || 'audio/ogg'
            //});
			if (framesExtracted == 0) {
				//alert(12345)
				//pause(true);
				//onEnd();
			} else{

			}			
		//}
	}

	function attachSoundTouch(options){
		if (audioNode){
			audioNode.disconnect();
		}
		audioNode = initParams.audioContext.createScriptProcessor ? initParams.audioContext.createScriptProcessor(BUFFER_SIZE, 2, 2) : initParams.audioContext.createJavaScriptNode(BUFFER_SIZE, 2, 2);
		soundBuffer = options.soundBuffer;
		if(options.pitch!=1){
			audioNode.onaudioprocess = onPitchAudioProcess;
			var currentPosition = options.position * (options.soundBuffer.duration * initParams.audioContext.sampleRate);
			currentPosition = Math.round(options.soundBuffer.length*options.position);
			blob = null;
			soundTouch = new SoundTouch();
			soundTouch.pitch = options.pitch;
			soundTouch.tempo = options.tempo;
			simpleFilter = new SimpleFilter(soundTouchSource, soundTouch);
			simpleFilter.sourcePosition = currentPosition;	
		} else{
			var source = initParams.audioContext.createBufferSource();
			source.buffer = soundBuffer;
			ticksTotal = Math.floor(soundBuffer.length/BUFFER_SIZE);
			currentTick = Math.floor(ticksTotal*options.position);
			audioNode.onaudioprocess = onAudioProcess;
			audioNode.loop  = true;
			source.connect(audioNode);
			console.log(options.position)
			source.start(0,options.position*soundBuffer.duration);
		}
		return audioNode;
	}
	 function getSourcePosition(){
		 return simpleFilter.sourcePosition/soundBuffer.length*soundBuffer.duration;
	 }
	return {
		attachSoundTouch:attachSoundTouch,
		getSourcePosition:getSourcePosition,
		pause:stopPlayingInterval
	};

};


function SUK_Player(_initParams){
	var initParams = _initParams||{},
		mediaElements = new MediaElements(),
		audioContext = mediaElements.getAudioContextClass(),
		BUFFER_SIZE = 4096;
	if(!audioContext){
		var htmlPlayer = new Audio();
		htmlPlayer.oncanplay = function(){
			initParams.onCanPlay&&initParams.onCanPlay();
			initParams.onDecode&&initParams.onDecode();
		}
		htmlPlayer.ontimeupdate = function(){
			initParams.onTimeUpdate&&initParams.onTimeUpdate(htmlPlayer.currentTime);
		}
		initParams.onAudioContextError&&initParams.onAudioContextError();
	} else{
		// писалка видео и аудио с камеры
		var	recorder = new Recorder({
				audioContext:audioContext,
				onRecordLevel:initParams.onRecordLevel,
				onStopRecord:initParams.onStopRecord,
				BUFFER_SIZE:BUFFER_SIZE,
				filters: mediaElements.createFilters()
			}),
			// загрузчик аудио данных (мелодии) по сети
			preloader = new Preloader({
				audioContext:audioContext
			}),
			// проигрыватель с возможностью модуляции
			pitchPlayer = new PitchPlayer({
				audioContext:audioContext,
				BUFFER_SIZE:BUFFER_SIZE,
				onPlay:onPlay,
			}),
			/*
			recPitchPlayer = new PitchPlayer({
				audioContext:audioContext,
				BUFFER_SIZE:BUFFER_SIZE,
				onPlay:onPlay,
			}),
			*/
			// аудионода после проигрывателя (подключается к фильтрам)
			audioNode,
			// аудионода фильтра усиления
			gainNode = audioContext.createGain(),
			// текущее положение проигрывателя в процентах
			position,
			// текущее значение модуляции (-3..+3)
			pitch,
			// текущее значение скорости (-2..+2)
			tempo,
			// текущее значение громкомси (0..1)
			volume,
			// загруженный аудио буфер
			soundBuffer,
			// флаг проигрывания
			playing,
			/*
			replaySourceNode,
			recordingAudioNode = new RecordingAudioNode({
				audioContext:audioContext,
				BUFFER_SIZE:BUFFER_SIZE,
				supressRecord:false
				
			}),
			*/
			bufferDuration;
			
	}
	function attachPitchPlayer(){
		audioNode = pitchPlayer.attachSoundTouch({
			tempo:tempo,
			pitch:pitch,
			soundBuffer:soundBuffer,
			position:position
		});
	}	
	function init(){
		position = 0;
		pitch = 1;
		tempo = 1;
		volume = 1;
		mediaElements.filters = mediaElements.createFilters();
		attachPitchPlayer();
		
	}
	function getDevices(){
		return mediaElements.getDevices(initParams.onGetDevices);
	};
	function load(_url){
		if(!audioContext){
			htmlPlayer.src = _url;
			console.log(htmlPlayer);
			return;
		}
		if(audioNode){
			pause();
		}
		preloader.load(_url, function(_buffer){
			soundBuffer = _buffer;
			bufferDuration = soundBuffer.duration;
			init();
			initParams.onCanPlay&&initParams.onCanPlay();
			initParams.onDecode&&initParams.onDecode();
		}, initParams);
	};
	function preload(_urlArray){
		preloader.preload(_urlArray);
	};
	function connectNodeToDestination(_node){
		var filters = mediaElements.filters;
		_node.disconnect();
		gainNode.disconnect();
		_node.connect(gainNode);
		gainNode.connect(filters[0]);
		/*
		filters[filters.length - 1].connect(recordingAudioNode);		
		recordingAudioNode.connect(audioContext.destination);
		*/
		filters[filters.length - 1].connect(audioContext.destination);		
	}
	function onPlay(_position,duration, correction){
		correction = correction||0;
		if(!_position) return;
		position = _position;
		if(Math.round(_position*1000)==1000){
			pause(true);
			stopReplay(true);
			initParams.onEnd&&initParams.onEnd();
		}else{
			initParams.onTimeUpdate&&initParams.onTimeUpdate(_position*duration+(correction)/1000);
		}
	}
	function play(supress) {
		if(!supress){
			console.log('YOU CHOOSE PLAY');
		}
		if(!audioContext){
			htmlPlayer.play();
			return;
		}
		connectNodeToDestination(audioNode);
		onPlay();
		playing = true;
		//playing = setInterval(onPlay,100);
		!supress&&initParams.onPlay&&initParams.onPlay();
	}
	function pause(supress) {
		if(!supress){
			console.log('YOU CHOOSE PAUSE');
		}
		if(!audioContext){
			htmlPlayer.pause();
			return;
		}
		pitchPlayer.pause();
		/*
		recPitchPlayer&&recPitchPlayer.pause();
		*/
		playing = null;
		audioNode&&audioNode.disconnect();
		/*
		recordingAudioNode.stopRecord();
		*/
		recorder.stopRecord(supress);
		!supress&&initParams.onPause&&initParams.onPause();
	}	
	function startRecord() {
		if(!audioContext){
			return;
		}
		console.log('YOU CHOOSE START RECORD');
		setPosition(0, true);
		/*
		recordingAudioNode.startRecord();
		*/
		recorder.startRecord();
		play(true);
	}			
	function stopReplay(supress) {
		if(!audioContext){
			return;
		}
		if(!supress){
			console.log('YOU CHOOSE STOP REPLAY');
		}
		//replaySourceNode&&replaySourceNode.disconnect();
		//setPosition(0);
		recorder.stopReplay(supress);
	}
	function replay(delay, position, supress) {
		console.log('DISABLED!');
		return;
		if(!audioContext){
			return;
		}
		if(!supress){
			console.log('YOU CHOOSE REPLAY');
		}
		delay = delay||0;

		var buffer = recordingAudioNode.getBuffer();
		position = position/buffer.duration||0;
		replaySourceNode = recPitchPlayer.attachSoundTouch({
			tempo:1,
			pitch:1,
			soundBuffer:buffer,
			position:position
		});
		var replayDuration = buffer.duration;
		recorder.replay(position,function(){
			setTimeout(function(){
				replaySourceNode.connect(audioContext.destination);
			},delay);
		});
	}
	function setTone(_newPitch, supress) {
		if(!audioContext){
			return;
		}
		if(!supress){
			console.log('YOU CHOOSE SET TONE');
		}
		var isPlaying = !!playing;
		pause(true);
		pitch = _newPitch;
		attachPitchPlayer();
		if(isPlaying){
			play(true);	
		}
	}	
	function setFilter(_freqArray, supress) {
		if(!audioContext){
			return;
		}
		if(!supress){
			console.log('YOU CHOOSE SET FILTER');
		}
		var filters = mediaElements.filters;
		for(var a=_freqArray,i=0,ii=a.length;i<ii;i++){
			filters[i].gain.value = a[i];
		}
	}	
	function detachFilter(supress) {
		if(!audioContext){
			return;
		}
		if(!supress){
			console.log('YOU CHOOSE DETACH FILTER');
		}
		setFilter([0,0,0,0,0,0,0,0,0,0], true)
	}
	function setPosition(_value, supress) {
		if(!supress){
			console.log('YOU CHOOSE SET POSITION');
		}
		if(!audioContext){
			htmlPlayer.currentTime = _value;
			return;
		}
		var isPlaying = !!playing;
		pause(true);
		position = _value/bufferDuration;
		attachPitchPlayer();
		if(isPlaying){
			play(true);	
		}	
	}	
	function setSpeed(_value, supress) {
		if(!supress){
			console.log('YOU CHOOSE SET SPEED');
		}
		if(!audioContext){
			htmlPlayer.playbackRate = _value;
			return;
		}
		var isPlaying = !!playing;
		pause(true);
		tempo = _value;
		attachPitchPlayer();
		if(isPlaying){
			play(true);	
		}
	}	
	function getDuration() {
		if(!audioContext){
			return htmlPlayer.duration;
		}
		return bufferDuration;
	}	
	function getReplayDuration() {
		console.log('DISABLED!');
		return;
		if(!audioContext){
			return htmlPlayer.duration;
		}
		return recordingAudioNode.getDuration();
	}	
	function setVolume(_value, supress) {
		if(!supress){
			console.log('YOU CHOOSE SET VOLUME');
		}
		if(!audioContext){
			htmlPlayer.volume = _value;
			return;
		}
		gainNode.gain.value = _value;
	}	
	function createBuffer(channels){
		var buffer = audioContext.createBuffer(2,channels.left.length, audioContext.sampleRate);
		function setChannel(channel, channelNumber){
			var nowBuffering = buffer.getChannelData(channelNumber);
			for(var a=channel,i=0,ii=a.length;i<ii;i++){
				nowBuffering[i] = a[i];
			}
			
		}
		setChannel(channels.left,0);
		setChannel(channels.right,1);
		return buffer;
	}
	function getBlobs(_url) {
		if(!audioContext){
			return;
		}
		
		var blobs = recorder.getBlobs();

		return blobs;
		return {
			video : recorder.getVideo(),
			audio : (recorder.getOriginalBuffer().length? new Blob([audioBufferToWav(recorder.getOriginalBuffer())],{type: 'audio/webm'}):null),
			//voice : new Blob([audioBufferToWav(recorder.getBuffer())],{type: 'audio/webm'}),
			//original : (recorder.getOriginalBuffer().length? new Blob([audioBufferToWav(recorder.getOriginalBuffer())],{type: 'audio/webm'}):null),
			//music : new Blob([audioBufferToWav(recordingAudioNode.getBuffer())],{type: 'audio/webm'}),
		};
	}
	function setReverbGain(value){
		if(!audioContext){
			return;
		}
		recorder.setReverbGain(value)
	}	
	function setReverbDelay(value){
		if(!audioContext){
			return;
		}
		recorder.setReverbDelay(value)
	}		
	function setReverbConvolver(value){
		if(!audioContext){
			return;
		}
		recorder.setReverbConvolver(value)
	}	
	function startCapture(_options){
		if(!audioContext){
			return;
		}
		console.log('YOU CHOOSE START CAPTURE');
		recorder.startCapture(_options);
	}	
	function stopCapture(){
		if(!audioContext){
			return;
		}
		console.log('YOU CHOOSE STOP CAPTURE');
		recorder.stopCapture();
	}	
	function setRecordFilter(value){
		if(!audioContext){
			return;
		}
		console.log('YOU CHOOSE SET RECORD FILTER');
		recorder.setFilter(value);
	}
	function setMicLevel(value){
		if(!audioContext){
			return;
		}
		recorder.setMicLevel(value)
	}		
	function setMicOutput(value){
		if(!audioContext){
			return;
		}
		recorder.setOutput(value)
	}
	return {
		load:load,
		preload:preload,
		play:play,
		setPosition:setPosition,
		setTone:setTone,
		setSpeed:setSpeed,
		setVolume:setVolume,
		pause:pause,
		startRecord:startRecord,
		startCapture:startCapture,		
		stopCapture:stopCapture,
		replay:replay,
		setFilter:setFilter,
		detachFilter:detachFilter,
		getDuration:getDuration,
		getReplayDuration:getReplayDuration,
		getBlobs:getBlobs,
		getDevices:getDevices,
		setMicLevel:setMicLevel,
		setMicOutput:setMicOutput,
		stopReplay:stopReplay,
		setReverbDelay:setReverbDelay,
		setReverbGain:setReverbGain,
		setReverbConvolver:setReverbConvolver,
		setRecordFilter:setRecordFilter,
		audioContext:audioContext,
		version : 0.915
	};

};
function Preloader(_initParams){
	var initParams = _initParams||{},
		preloadUrlArray = [],
		preloadRequest;
		
	function beginPreload(){
		function next(){
			preloadUrlArray.shift();
			beginPreload();
		}
		if(preloadRequest){
			preloadRequest.abort();
			preloadRequest = null;
		}
		if(preloadUrlArray.length>0){
			var url = preloadUrlArray[0]
			preloadRequest = new XMLHttpRequest();
			preloadRequest.open('GET', url, true);
			preloadRequest.responseType = 'arraybuffer';
			preloadRequest.onload = function() {
				initParams.onPreload&&initParams.onPreload(url);
				next();
			}	
			preloadRequest.onerror = function(event) {
				next();
			}		
			preloadRequest.send();
		}
	}
	function decodeData(data, callback, callbacks){
		initParams.audioContext.decodeAudioData(data, function(theBuffer){
			callback(theBuffer);
		}, callbacks.onDecodeError?callbacks.onDecodeError:function(){console.log('decode error')})
		
	};
	function load (url, callback, callbacks){
		if(preloadRequest){
			preloadRequest.abort();
		}
		preloadRequest = new XMLHttpRequest();
		preloadRequest.open('GET', url, true);
		preloadRequest.responseType = 'arraybuffer';
		preloadRequest.onload = function(){
			decodeData(preloadRequest.response,callback,callbacks)
		};	
		preloadRequest.onerror = callbacks.onLoadError;		
		preloadRequest.onabort = callbacks.onLoadAbort;		
		preloadRequest.onprogress = function(event){
			callbacks.onLoadProgress&&callbacks.onLoadProgress(event.loaded/event.total);	
		}			
		preloadRequest.send();
	}
	function preload(array){
		if((!array)||(array.length==0)){
			preloadUrlArray = [];
			beginPreload();
			return;
		}
		if((preloadUrlArray.length > 0)&&(preloadUrlArray[0]==array[0])){
			preloadUrlArray = array;
		}else {
			preloadUrlArray = array;
			beginPreload();
		}		
	}

	return {
		preload : preload,
		load : load
	};

};


function RecordingAudioNode(_initParams){
	var initParams = _initParams||{},
	audioContext = initParams.audioContext,
	BUFFER_SIZE = initParams.BUFFER_SIZE,
	channelsNumber = initParams.mono?1:2,
	audioNode = audioContext.createScriptProcessor ? audioContext.createScriptProcessor(BUFFER_SIZE, channelsNumber, channelsNumber):audioContext.createJavaScriptNode(BUFFER_SIZE, channelsNumber, channelsNumber),
	recording,
	recordedBuffer,
	duration,
	leftchannel = [],
	rightchannel = [];
	
	function onAudioProcess (e){
		if(!recording){
			return;
		}
		var left = e.inputBuffer.getChannelData (0);
		var outLeft =  e.outputBuffer.getChannelData (0);
		if(initParams.mono){
			var right = left;
			var outRight =  outLeft;
		}else{
			var right = e.inputBuffer.getChannelData (1);
			var outRight =  e.outputBuffer.getChannelData (1);
		}
		var max = -Infinity;
        for(var i=0;i<left.length;i++){
			max = Math.max(max,left[i],right[i]);
			if(recording&&(!initParams.supressRecord)){
				leftchannel.push(left[i]);
				//console.log(left[i].toFixed(2))
				if(!initParams.mono){
					rightchannel.push(right[i]);
				}
			}
			outLeft[i] = left[i];
			outRight[i]=right[i];
			
		};
		initParams.onRecordLevel&&initParams.onRecordLevel(max);
	}
	
	function trimBuffer(value){
		if(!value){
			return;
		}
		var diff = value - leftchannel.length;
		var newLeftChannel = [],
			newRightChannel = [];
		for(var a=leftchannel,i=0,ii=a.length;i<ii;i++){
			console.log(a[i])
				newLeftChannel.push(a[i]);
				newRightChannel.push(rightchannel[i]);
		}
		leftchannel = newLeftChannel;
		rightChannel = newRightChannel;
			
	}
	function startRecord(){
		leftchannel = [];
		rightchannel = [];
		recordedBuffer = null;
		recording = true;
	}
	function stopRecord(){
		if(recording){
			recordedBuffer = getBuffer()
			duration = recordedBuffer.duration;
		}
		recording = false;
	}
	function getDuration(){
		return duration;
	}
	function getBuffer(){
		if(recordedBuffer){
			return recordedBuffer;
		}
		if(!leftchannel.length){
			return {length:0, duration:0};
		}
		var buffer = audioContext.createBuffer(channelsNumber,leftchannel.length, audioContext.sampleRate);
		function setChannel(channel, channelNumber){
			var nowBuffering = buffer.getChannelData(channelNumber);
			//console.log(channel)
			for(var a=channel,i=0,ii=a.length;i<ii;i++){
				nowBuffering[i] = a[i];
			}
			
		}
		setChannel(leftchannel,0);
		if(!initParams.mono){
			setChannel(rightchannel,1);
		}
		rightchannel = [];
		leftchannel = [];
		return buffer;
	}
	function getLength(){
		return leftchannel.length;
	}
	audioNode.trimBuffer = trimBuffer;
	audioNode.onaudioprocess = onAudioProcess;
	audioNode.startRecord = startRecord;
	audioNode.stopRecord = stopRecord;
	audioNode.getBuffer = getBuffer;
	audioNode.getDuration = getDuration;
	audioNode.getLength = getLength;
	return audioNode;
}
/*global MediaStream:true */
if (typeof MediaStream !== 'undefined' && !('stop' in MediaStream.prototype)) {
    MediaStream.prototype.stop = function() {
        this.getAudioTracks().forEach(function(track) {
			track.stop();
        });

        this.getVideoTracks().forEach(function(track) {
			track.stop();
        });
    };
}

function Recorder(_initParams){
	
	var audioContext = _initParams.audioContext,
		BUFFER_SIZE = _initParams.BUFFER_SIZE,
		stream, 
		videoRecorder,
		audioRecorder,
		recordingAudioNode = new RecordingAudioNode({
			audioContext:audioContext,
			BUFFER_SIZE:BUFFER_SIZE,
			onRecordLevel:_initParams.onRecordLevel,
			mono:true,
			supressRecord:true
		}),
		originalAudioNode = new RecordingAudioNode({
			audioContext:audioContext,
			BUFFER_SIZE:BUFFER_SIZE,
			mono:true
		}),
		recPitchPlayer = new PitchPlayer({
			audioContext:audioContext,
			BUFFER_SIZE:BUFFER_SIZE
		}),
		sourceNode,
		replaySourceNode,
		convolverNode = audioContext.createConvolver(),
		gainNode = audioContext.createGain(),
		destinationGainNode = audioContext.createGain(),
		analyserNode = audioContext.createAnalyser(),
		analyserFrequencyData = new Uint8Array(10),
		recording,
		mediaType,
		reverbSound,
		reverbConvolver = true,
		micLevel = 1,
		reverbGain = 0.3,
		reverbGainNode = audioContext.createGain();
	function setOutput(toDestination){
		destinationGainNode.gain.value = toDestination?1:0;
	};
	function setMicLevel(value){
		micLevel = value;
		buildAudioGraph();
	}
	function buildAudioGraph(){
		if(!sourceNode){
			return;
		}
		sourceNode&&sourceNode.disconnect();
		convolverNode&&convolverNode.disconnect();
		gainNode&&gainNode.disconnect();
		analyserNode&&analyserNode.disconnect();
		recordingAudioNode&&recordingAudioNode.disconnect();
		originalAudioNode&&originalAudioNode.disconnect();
		reverbGainNode&&reverbGainNode.disconnect();
		destinationGainNode&&destinationGainNode.disconnect();
		_initParams.filters[_initParams.filters.length - 1].disconnect();
		

		
		reverbGainNode.gain.value=reverbGain*micLevel;
		gainNode.gain.value = (1-reverbGain)*micLevel;

		sourceNode.connect(reverbGainNode);
		reverbGainNode.connect(analyserNode);
		analyserNode.connect(destinationGainNode)
		destinationGainNode.connect(audioContext.destination)
		
		
		
		/*
		
		reverbGainNode.gain.value=reverbGain*micLevel;
		gainNode.gain.value = (1-reverbGain)*micLevel;
		

		sourceNode.connect(originalAudioNode);
		originalAudioNode.connect(_initParams.filters[0]);
		var lastFilterNode = _initParams.filters[_initParams.filters.length - 1];
		
		lastFilterNode.connect(convolverNode);
		lastFilterNode.connect(gainNode);
		
		convolverNode.connect(reverbGainNode);
		reverbGainNode.connect(recordingAudioNode);
		gainNode.connect(recordingAudioNode);

		recordingAudioNode.connect(destinationGainNode)
		destinationGainNode.connect(audioContext.destination)
		*/
	};
	function stopCapture(){
		stopStream();
	}
	function startCapture(_options){
		_options = _options||{audio: true, video: true};
		
		navigator.getUserMedia(_options, function(_stream) {
			stream = _stream;
			mediaType = _options;
			if(_options.video){
				var video = document.querySelector('#capturingVideo');
				video.volume=0;
				video.src = window.URL.createObjectURL(_stream);
			}else{
				
			}
			sourceNode = audioContext.createMediaStreamSource(stream);
			buildAudioGraph();
		},function(){});
	};	
	function getBlobs(){
		return videoRecorder&&videoRecorder.getBlob()||null;
	}	
	function getVideo(){
		return videoRecorder&&videoRecorder.getBlob()||null;
	}
	function startRecord(){
		recording = true;
		//recordingAudioNode.startRecord();
		if(!videoRecorder){
			videoRecorder = new MRecordRTC(stream);	
		}
		videoRecorder.bufferSize = 1024;
		videoRecorder.sampleRate = 8000;
		videoRecorder.numberOfAudioChannels = 1;
		videoRecorder.startRecording();			
	}
	function stopStream(){
		sourceNode.disconnect();
		recordingAudioNode.disconnect();
		originalAudioNode&&originalAudioNode.disconnect();
		if(!stream) return;
		videoRecorder = null;
		stream.stop();
		stream = null;
	}
	function stopRecord(supress){
		if(recording&&!supress){
			var callback = _initParams.onStopRecord;
			console.log('YOU CHOOSE STOP RECORD');
		}
		recordingAudioNode.stopRecord();
		recording = false;
		if(videoRecorder){
			videoRecorder.stopRecording(function(url, type) {
				callback&&callback(url, type);
			});
		} else{
			originalAudioNode.stopRecord();
			callback&&callback();
		}
	}
	function trimBuffer(length){
		return recordingAudioNode.trimBuffer(length);
	}
	function replay(position,callback){
		var buffer = recordingAudioNode.getBuffer();
		function playAudio(){
			
			replaySourceNode = recPitchPlayer.attachSoundTouch({
				tempo:1,
				pitch:1,
				soundBuffer:buffer,
				position:position
			});
			replaySourceNode.connect(audioContext.destination);
			callback();
		}
		if(videoRecorder){
			var video = document.querySelector('#capturedVideo');
			video.autoplay = false;
			var oncanplay = function(){
				video.play();
				playAudio();
			}
			video.oncanplay  = oncanplay;
			video.volume = 0;
			video.src = videoRecorder.toURL();	
			video.currentTime = position*buffer.duration;
		} else{
			playAudio();
		}
	}
	function stopReplay(){
		replaySourceNode&&replaySourceNode.disconnect();
		if(videoRecorder){
			var video = document.querySelector('#capturedVideo');
			//video.src = '';
			video.pause();
		}
	}	
	function setReverbGain(value){
		reverbGain = value;
		buildAudioGraph();
	}	
	function setReverbConvolver(value){
		reverbConvolver = value;
		buildAudioGraph();
	}
	function loadReverb (){
		var preloadRequest = new XMLHttpRequest();
		preloadRequest.open('GET', 'reverb.wav', true);
		preloadRequest.responseType = 'arraybuffer';
		preloadRequest.onload = function(data){
			audioContext.decodeAudioData(preloadRequest.response, function(buffer){
				convolverNode.buffer = buffer;
			})
		};		
		preloadRequest.send();
	}
	function setFilter(_freqArray, supress) {
		for(var a=_freqArray,i=0,ii=a.length;i<ii;i++){
			_initParams.filters[i].gain.value = a[i];
		}
	}
	function getBuffer() {
		return recordingAudioNode.getBuffer();
	}	
	function getOriginalBuffer() {
		return originalAudioNode.getBuffer();
	}

	Storage.AudioContextConstructor	= audioContext;
	if(!navigator.getUserMedia){
		_initParams.onGetUserMediaError&&_initParams.onGetUserMediaError();
	}
	loadReverb();
	
	function updateRecord() {

		requestAnimationFrame(updateRecord);
		if (!stream){
			return;
		}
		// Get the new frequency data
		analyserNode.getByteFrequencyData(analyserFrequencyData);
		_initParams.onRecordLevel(analyserFrequencyData);
	};
	updateRecord();
	return {
		startRecord:startRecord,
		startCapture:startCapture,	
		stopRecord:stopRecord,		
		stopCapture:stopCapture,
		replay:replay,
		getVideo:getVideo,
		getBlobs:getBlobs,
		getBuffer:getBuffer,
		getOriginalBuffer:getOriginalBuffer,
		trimBuffer:trimBuffer,
		setMicLevel:setMicLevel,
		setReverbGain:setReverbGain,
		stopReplay:stopReplay,
		setReverbConvolver:setReverbConvolver,
		setFilter:setFilter,
		setOutput:setOutput
	};

}


'use strict';

// Last time updated: 2016-08-28 3:42:15 AM UTC

// Open-Sourced: https://github.com/muaz-khan/RecordRTC

//--------------------------------------------------
// Muaz Khan     - www.MuazKhan.com
// MIT License   - www.WebRTC-Experiment.com/licence
//--------------------------------------------------

// ____________
// RecordRTC.js

/**
 * {@link https://github.com/muaz-khan/RecordRTC|RecordRTC} is a JavaScript-based media-recording library for modern web-browsers (supporting WebRTC getUserMedia API). It is optimized for different devices and browsers to bring all client-side (pluginfree) recording solutions in single place.
 * @summary JavaScript audio/video recording library runs top over WebRTC getUserMedia API.
 * @license {@link https://github.com/muaz-khan/RecordRTC#license|MIT}
 * @author {@link http://www.MuazKhan.com|Muaz Khan}
 * @typedef RecordRTC
 * @class
 * @example
 * var recordRTC = RecordRTC(mediaStream, {
 *     type: 'video' // audio or video or gif or canvas
 * });
 *
 * // or, you can also use the "new" keyword
 * var recordRTC = new RecordRTC(mediaStream[, config]);
 * @see For further information:
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 * @param {MediaStream} mediaStream - MediaStream object fetched using getUserMedia API or generated using captureStreamUntilEnded or WebAudio API.
 * @param {object} config - {type:"video", disableLogs: true, numberOfAudioChannels: 1, bufferSize: 0, sampleRate: 0, video: HTMLVideoElement, etc.}
 */

function RecordRTC(mediaStream, config) {
    if (!mediaStream) {
        throw 'MediaStream is mandatory.';
    }

    config = config || {
        type: 'video'
    };

    config = new RecordRTCConfiguration(mediaStream, config);

    // a reference to user's recordRTC object
    var self = this;

    function startRecording() {
        if (!config.disableLogs) {
            console.debug('started recording ' + config.type + ' stream.');
        }

        if (mediaRecorder) {
            mediaRecorder.clearRecordedData();
            mediaRecorder.resume();

            if (self.recordingDuration) {
                handleRecordingDuration();
            }
            return self;
        }

        initRecorder(function() {
            if (self.recordingDuration) {
                handleRecordingDuration();
            }
        });

        return self;
    }

    function initRecorder(initCallback) {
        if (initCallback) {
            config.initCallback = function() {
                initCallback();
                initCallback = config.initCallback = null; // recordRTC.initRecorder should be call-backed once.
            };
        }

        var Recorder = new GetRecorderType(mediaStream, config);

        mediaRecorder = new Recorder(mediaStream, config);
        mediaRecorder.record();

        if (!config.disableLogs) {
            console.debug('Initialized recorderType:', mediaRecorder.constructor.name, 'for output-type:', config.type);
        }
    }

    function stopRecording(callback) {
        if (!mediaRecorder) {
            return console.warn(WARNING);
        }

        /*jshint validthis:true */
        var recordRTC = this;

        if (!config.disableLogs) {
            console.warn('Stopped recording ' + config.type + ' stream.');
        }

        if (config.type !== 'gif') {
            mediaRecorder.stop(_callback);
        } else {
            mediaRecorder.stop();
            _callback();
        }

        function _callback(__blob) {
            for (var item in mediaRecorder) {
                if (self) {
                    self[item] = mediaRecorder[item];
                }

                if (recordRTC) {
                    recordRTC[item] = mediaRecorder[item];
                }
            }

            var blob = mediaRecorder.blob;

            if (!blob) {
                if (__blob) {
                    mediaRecorder.blob = blob = __blob;
                } else {
                    throw 'Recording failed.';
                }
            }

            if (callback) {
                var url = URL.createObjectURL(blob);
                callback(url);
            }

            if (blob && !config.disableLogs) {
                console.debug(blob.type, '->', bytesToSize(blob.size));
            }

            if (!config.autoWriteToDisk) {
                return;
            }

            getDataURL(function(dataURL) {
                var parameter = {};
                parameter[config.type + 'Blob'] = dataURL;
                DiskStorage.Store(parameter);
            });
        }
    }

    function pauseRecording() {
        if (!mediaRecorder) {
            return console.warn(WARNING);
        }

        mediaRecorder.pause();

        if (!config.disableLogs) {
            console.debug('Paused recording.');
        }
    }

    function resumeRecording() {
        if (!mediaRecorder) {
            return console.warn(WARNING);
        }

        // not all libs have this method yet
        mediaRecorder.resume();

        if (!config.disableLogs) {
            console.debug('Resumed recording.');
        }
    }

    function readFile(_blob) {
        postMessage(new FileReaderSync().readAsDataURL(_blob));
    }

    function getDataURL(callback, _mediaRecorder) {
        if (!callback) {
            throw 'Pass a callback function over getDataURL.';
        }

        var blob = _mediaRecorder ? _mediaRecorder.blob : (mediaRecorder || {}).blob;

        if (!blob) {
            if (!config.disableLogs) {
                console.warn('Blob encoder did not finish its job yet.');
            }

            setTimeout(function() {
                getDataURL(callback, _mediaRecorder);
            }, 1000);
            return;
        }

        if (typeof Worker !== 'undefined' && !navigator.mozGetUserMedia) {
            var webWorker = processInWebWorker(readFile);

            webWorker.onmessage = function(event) {
                callback(event.data);
            };

            webWorker.postMessage(blob);
        } else {
            var reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onload = function(event) {
                callback(event.target.result);
            };
        }

        function processInWebWorker(_function) {
            var blob = URL.createObjectURL(new Blob([_function.toString(),
                'this.onmessage =  function (e) {' + _function.name + '(e.data);}'
            ], {
                type: 'application/javascript'
            }));

            var worker = new Worker(blob);
            URL.revokeObjectURL(blob);
            return worker;
        }
    }

    function handleRecordingDuration() {
        setTimeout(function() {
            stopRecording(self.onRecordingStopped);
        }, self.recordingDuration);
    }

    var WARNING = 'It seems that "startRecording" is not invoked for ' + config.type + ' recorder.';

    var mediaRecorder;

    var returnObject = {
        /**
         * This method starts recording. It doesn't take any arguments.
         * @method
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.startRecording();
         */
        startRecording: startRecording,

        /**
         * This method stops recording. It takes a single "callback" argument. It is suggested to get blob or URI in the callback to make sure all encoders finished their jobs.
         * @param {function} callback - This callback function is invoked after completion of all encoding jobs.
         * @method
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.stopRecording(function(videoURL) {
         *     video.src = videoURL;
         *     recordRTC.blob; recordRTC.buffer;
         * });
         */
        stopRecording: stopRecording,

        /**
         * This method pauses the recording process.
         * @method
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.pauseRecording();
         */
        pauseRecording: pauseRecording,

        /**
         * This method resumes the recording process.
         * @method
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.resumeRecording();
         */
        resumeRecording: resumeRecording,

        /**
         * This method initializes the recording process.
         * @method
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.initRecorder();
         */
        initRecorder: initRecorder,

        /**
         * This method sets the recording duration.
         * @method
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.setRecordingDuration();
         */
        setRecordingDuration: function(milliseconds, callback) {
            if (typeof milliseconds === 'undefined') {
                throw 'milliseconds is required.';
            }

            if (typeof milliseconds !== 'number') {
                throw 'milliseconds must be a number.';
            }

            self.recordingDuration = milliseconds;
            self.onRecordingStopped = callback || function() {};

            return {
                onRecordingStopped: function(callback) {
                    self.onRecordingStopped = callback;
                }
            };
        },

        /**
         * This method can be used to clear/reset all the recorded data.
         * @method
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.clearRecordedData();
         */
        clearRecordedData: function() {
            if (!mediaRecorder) {
                return console.warn(WARNING);
            }

            mediaRecorder.clearRecordedData();

            if (!config.disableLogs) {
                console.debug('Cleared old recorded data.');
            }
        },

        /**
         * It is equivalent to <code class="str">"recordRTC.blob"</code> property.
         * @method
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.stopRecording(function() {
         *     var blob = recordRTC.getBlob();
         *
         *     // equivalent to: recordRTC.blob property
         *     var blob = recordRTC.blob;
         * });
         */
        getBlob: function() {
            if (!mediaRecorder) {
                return console.warn(WARNING);
            }

            return mediaRecorder.blob;
        },

        /**
         * This method returns the DataURL. It takes a single "callback" argument.
         * @param {function} callback - DataURL is passed back over this callback.
         * @method
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.stopRecording(function() {
         *     recordRTC.getDataURL(function(dataURL) {
         *         video.src = dataURL;
         *     });
         * });
         */
        getDataURL: getDataURL,

        /**
         * This method returns the Virutal/Blob URL. It doesn't take any arguments.
         * @method
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.stopRecording(function() {
         *     video.src = recordRTC.toURL();
         * });
         */
        toURL: function() {
            if (!mediaRecorder) {
                return console.warn(WARNING);
            }

            return URL.createObjectURL(mediaRecorder.blob);
        },

        /**
         * This method saves the blob/file to disk (by invoking save-as dialog). It takes a single (optional) argument i.e. FileName
         * @method
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.stopRecording(function() {
         *     recordRTC.save('file-name');
         * });
         */
        save: function(fileName) {
            if (!mediaRecorder) {
                return console.warn(WARNING);
            }

            invokeSaveAsDialog(mediaRecorder.blob, fileName);
        },

        /**
         * This method gets a blob from indexed-DB storage. It takes a single "callback" argument.
         * @method
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.getFromDisk(function(dataURL) {
         *     video.src = dataURL;
         * });
         */
        getFromDisk: function(callback) {
            if (!mediaRecorder) {
                return console.warn(WARNING);
            }

            RecordRTC.getFromDisk(config.type, callback);
        },

        /**
         * This method appends an array of webp images to the recorded video-blob. It takes an "array" object.
         * @type {Array.<Array>}
         * @param {Array} arrayOfWebPImages - Array of webp images.
         * @method
         * @memberof RecordRTC
         * @instance
         * @example
         * var arrayOfWebPImages = [];
         * arrayOfWebPImages.push({
         *     duration: index,
         *     image: 'data:image/webp;base64,...'
         * });
         * recordRTC.setAdvertisementArray(arrayOfWebPImages);
         */
        setAdvertisementArray: function(arrayOfWebPImages) {
            config.advertisement = [];

            var length = arrayOfWebPImages.length;
            for (var i = 0; i < length; i++) {
                config.advertisement.push({
                    duration: i,
                    image: arrayOfWebPImages[i]
                });
            }
        },

        /**
         * It is equivalent to <code class="str">"recordRTC.getBlob()"</code> method.
         * @property {Blob} blob - Recorded Blob can be accessed using this property.
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.stopRecording(function() {
         *     var blob = recordRTC.blob;
         *
         *     // equivalent to: recordRTC.getBlob() method
         *     var blob = recordRTC.getBlob();
         * });
         */
        blob: null,

        /**
         * @todo Add descriptions.
         * @property {number} bufferSize - Either audio device's default buffer-size, or your custom value.
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.stopRecording(function() {
         *     var bufferSize = recordRTC.bufferSize;
         * });
         */
        bufferSize: 0,

        /**
         * @todo Add descriptions.
         * @property {number} sampleRate - Audio device's default sample rates.
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.stopRecording(function() {
         *     var sampleRate = recordRTC.sampleRate;
         * });
         */
        sampleRate: 0,

        /**
         * @todo Add descriptions.
         * @property {ArrayBuffer} buffer - Audio ArrayBuffer, supported only in Chrome.
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.stopRecording(function() {
         *     var buffer = recordRTC.buffer;
         * });
         */
        buffer: null,

        /**
         * @todo Add descriptions.
         * @property {DataView} view - Audio DataView, supported only in Chrome.
         * @memberof RecordRTC
         * @instance
         * @example
         * recordRTC.stopRecording(function() {
         *     var dataView = recordRTC.view;
         * });
         */
        view: null
    };

    if (!this) {
        self = returnObject;
        return returnObject;
    }

    // if someone wants to use RecordRTC with the "new" keyword.
    for (var prop in returnObject) {
        this[prop] = returnObject[prop];
    }

    self = this;

    return returnObject;
}

/**
 * This method can be used to get all recorded blobs from IndexedDB storage.
 * @param {string} type - 'all' or 'audio' or 'video' or 'gif'
 * @param {function} callback - Callback function to get all stored blobs.
 * @method
 * @memberof RecordRTC
 * @example
 * RecordRTC.getFromDisk('all', function(dataURL, type){
 *     if(type === 'audio') { }
 *     if(type === 'video') { }
 *     if(type === 'gif')   { }
 * });
 */
RecordRTC.getFromDisk = function(type, callback) {
    if (!callback) {
        throw 'callback is mandatory.';
    }

    console.log('Getting recorded ' + (type === 'all' ? 'blobs' : type + ' blob ') + ' from disk!');
    DiskStorage.Fetch(function(dataURL, _type) {
        if (type !== 'all' && _type === type + 'Blob' && callback) {
            callback(dataURL);
        }

        if (type === 'all' && callback) {
            callback(dataURL, _type.replace('Blob', ''));
        }
    });
};

/**
 * This method can be used to store recorded blobs into IndexedDB storage.
 * @param {object} options - {audio: Blob, video: Blob, gif: Blob}
 * @method
 * @memberof RecordRTC
 * @example
 * RecordRTC.writeToDisk({
 *     audio: audioBlob,
 *     video: videoBlob,
 *     gif  : gifBlob
 * });
 */
RecordRTC.writeToDisk = function(options) {
    console.log('Writing recorded blob(s) to disk!');
    options = options || {};
    if (options.audio && options.video && options.gif) {
        options.audio.getDataURL(function(audioDataURL) {
            options.video.getDataURL(function(videoDataURL) {
                options.gif.getDataURL(function(gifDataURL) {
                    DiskStorage.Store({
                        audioBlob: audioDataURL,
                        videoBlob: videoDataURL,
                        gifBlob: gifDataURL
                    });
                });
            });
        });
    } else if (options.audio && options.video) {
        options.audio.getDataURL(function(audioDataURL) {
            options.video.getDataURL(function(videoDataURL) {
                DiskStorage.Store({
                    audioBlob: audioDataURL,
                    videoBlob: videoDataURL
                });
            });
        });
    } else if (options.audio && options.gif) {
        options.audio.getDataURL(function(audioDataURL) {
            options.gif.getDataURL(function(gifDataURL) {
                DiskStorage.Store({
                    audioBlob: audioDataURL,
                    gifBlob: gifDataURL
                });
            });
        });
    } else if (options.video && options.gif) {
        options.video.getDataURL(function(videoDataURL) {
            options.gif.getDataURL(function(gifDataURL) {
                DiskStorage.Store({
                    videoBlob: videoDataURL,
                    gifBlob: gifDataURL
                });
            });
        });
    } else if (options.audio) {
        options.audio.getDataURL(function(audioDataURL) {
            DiskStorage.Store({
                audioBlob: audioDataURL
            });
        });
    } else if (options.video) {
        options.video.getDataURL(function(videoDataURL) {
            DiskStorage.Store({
                videoBlob: videoDataURL
            });
        });
    } else if (options.gif) {
        options.gif.getDataURL(function(gifDataURL) {
            DiskStorage.Store({
                gifBlob: gifDataURL
            });
        });
    }
};

if (typeof module !== 'undefined' /* && !!module.exports*/ ) {
    module.exports = RecordRTC;
}

if (typeof define === 'function' && define.amd) {
    define('RecordRTC', [], function() {
        return RecordRTC;
    });
}

// __________________________
// RecordRTC-Configuration.js

/**
 * {@link RecordRTCConfiguration} is an inner/private helper for {@link RecordRTC}.
 * @summary It configures the 2nd parameter passed over {@link RecordRTC} and returns a valid "config" object.
 * @license {@link https://github.com/muaz-khan/RecordRTC#license|MIT}
 * @author {@link http://www.MuazKhan.com|Muaz Khan}
 * @typedef RecordRTCConfiguration
 * @class
 * @example
 * var options = RecordRTCConfiguration(mediaStream, options);
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 * @param {MediaStream} mediaStream - MediaStream object fetched using getUserMedia API or generated using captureStreamUntilEnded or WebAudio API.
 * @param {object} config - {type:"video", disableLogs: true, numberOfAudioChannels: 1, bufferSize: 0, sampleRate: 0, video: HTMLVideoElement, getNativeBlob:true, etc.}
 */

function RecordRTCConfiguration(mediaStream, config) {
    if (config.recorderType && !config.type) {
        if (config.recorderType === WhammyRecorder || config.recorderType === CanvasRecorder) {
            config.type = 'video';
        } else if (config.recorderType === GifRecorder) {
            config.type = 'gif';
        } else if (config.recorderType === StereoAudioRecorder) {
            config.type = 'audio';
        } else if (config.recorderType === MediaStreamRecorder) {
            if (mediaStream.getAudioTracks().length && mediaStream.getVideoTracks().length) {
                config.type = 'video';
            } else if (mediaStream.getAudioTracks().length && !mediaStream.getVideoTracks().length) {
                config.type = 'audio';
            } else if (!mediaStream.getAudioTracks().length && mediaStream.getVideoTracks().length) {
                config.type = 'audio';
            } else {
                // config.type = 'UnKnown';
            }
        }
    }

    if (typeof MediaStreamRecorder !== 'undefined' && typeof MediaRecorder !== 'undefined' && 'requestData' in MediaRecorder.prototype) {
        if (!config.mimeType) {
            config.mimeType = 'video/webm';
        }

        if (!config.type) {
            config.type = config.mimeType.split('/')[0];
        }

        if (!config.bitsPerSecond) {
            // config.bitsPerSecond = 128000;
        }
    }

    // consider default type=audio
    if (!config.type) {
        if (config.mimeType) {
            config.type = config.mimeType.split('/')[0];
        }
        if (!config.type) {
            config.type = 'audio';
        }
    }

    return config;
}

// __________________
// GetRecorderType.js

/**
 * {@link GetRecorderType} is an inner/private helper for {@link RecordRTC}.
 * @summary It returns best recorder-type available for your browser.
 * @license {@link https://github.com/muaz-khan/RecordRTC#license|MIT}
 * @author {@link http://www.MuazKhan.com|Muaz Khan}
 * @typedef GetRecorderType
 * @class
 * @example
 * var RecorderType = GetRecorderType(options);
 * var recorder = new RecorderType(options);
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 * @param {MediaStream} mediaStream - MediaStream object fetched using getUserMedia API or generated using captureStreamUntilEnded or WebAudio API.
 * @param {object} config - {type:"video", disableLogs: true, numberOfAudioChannels: 1, bufferSize: 0, sampleRate: 0, video: HTMLVideoElement, etc.}
 */

function GetRecorderType(mediaStream, config) {
    var recorder;

    // StereoAudioRecorder can work with all three: Edge, Firefox and Chrome
    // todo: detect if it is Edge, then auto use: StereoAudioRecorder
    if (isChrome || isEdge || isOpera) {
        // Media Stream Recording API has not been implemented in chrome yet;
        // That's why using WebAudio API to record stereo audio in WAV format
        recorder = StereoAudioRecorder;
    }

    if (typeof MediaRecorder !== 'undefined' && 'requestData' in MediaRecorder.prototype && !isChrome) {
        recorder = MediaStreamRecorder;
    }

    // video recorder (in WebM format)
    if (config.type === 'video' && (isChrome || isOpera)) {
        recorder = WhammyRecorder;
    }

    // video recorder (in Gif format)
    if (config.type === 'gif') {
        recorder = GifRecorder;
    }

    // html2canvas recording!
    if (config.type === 'canvas') {
        recorder = CanvasRecorder;
    }

    if (isMediaRecorderCompatible() && recorder !== CanvasRecorder && recorder !== GifRecorder && typeof MediaRecorder !== 'undefined' && 'requestData' in MediaRecorder.prototype) {
        if (mediaStream.getVideoTracks().length) {
            recorder = MediaStreamRecorder;
        }
    }

    if (config.recorderType) {
        recorder = config.recorderType;
    }

    if (!config.disableLogs && !!recorder && !!recorder.name) {
        console.debug('Using recorderType:', recorder.name || recorder.constructor.name);
    }

    return recorder;
}

// _____________
// MRecordRTC.js

/**
 * MRecordRTC runs on top of {@link RecordRTC} to bring multiple recordings in a single place, by providing simple API.
 * @summary MRecordRTC stands for "Multiple-RecordRTC".
 * @license {@link https://github.com/muaz-khan/RecordRTC#license|MIT}
 * @author {@link http://www.MuazKhan.com|Muaz Khan}
 * @typedef MRecordRTC
 * @class
 * @example
 * var recorder = new MRecordRTC();
 * recorder.addStream(MediaStream);
 * recorder.mediaType = {
 *     audio: true, // or StereoAudioRecorder or MediaStreamRecorder
 *     video: true, // or WhammyRecorder or MediaStreamRecorder
 *     gif: true    // or GifRecorder
 * };
 * // mimeType is optional and should be set only in advance cases.
 * recorder.mimeType = {
 *     audio: 'audio/wav',
 *     video: 'video/webm',
 *     gif:   'image/gif'
 * };
 * recorder.startRecording();
 * @see For further information:
 * @see {@link https://github.com/muaz-khan/RecordRTC/tree/master/MRecordRTC|MRecordRTC Source Code}
 * @param {MediaStream} mediaStream - MediaStream object fetched using getUserMedia API or generated using captureStreamUntilEnded or WebAudio API.
 */

function MRecordRTC(mediaStream) {

    /**
     * This method attaches MediaStream object to {@link MRecordRTC}.
     * @param {MediaStream} mediaStream - A MediaStream object, either fetched using getUserMedia API, or generated using captureStreamUntilEnded or WebAudio API.
     * @method
     * @memberof MRecordRTC
     * @example
     * recorder.addStream(MediaStream);
     */
    this.addStream = function(_mediaStream) {
        if (_mediaStream) {
            mediaStream = _mediaStream;
        }
    };

    /**
     * This property can be used to set the recording type e.g. audio, or video, or gif, or canvas.
     * @property {object} mediaType - {audio: true, video: true, gif: true}
     * @memberof MRecordRTC
     * @example
     * var recorder = new MRecordRTC();
     * recorder.mediaType = {
     *     audio: true, // TRUE or StereoAudioRecorder or MediaStreamRecorder
     *     video: true, // TRUE or WhammyRecorder or MediaStreamRecorder
     *     gif  : true  // TRUE or GifRecorder
     * };
     */
    this.mediaType = {
        audio: true,
        video: true
    };

    /**
     * This method starts recording.
     * @method
     * @memberof MRecordRTC
     * @example
     * recorder.startRecording();
     */
    this.startRecording = function() {
        var mediaType = this.mediaType;
        var recorderType;
        var mimeType = this.mimeType || {
            audio: null,
            video: null,
            gif: null
        };

        if (typeof mediaType.audio !== 'function' && isMediaRecorderCompatible() && mediaStream.getAudioTracks && !mediaStream.getAudioTracks().length) {
            // Firefox supports both audio/video in single blob
            mediaType.audio = false;
        }

        if (typeof mediaType.video !== 'function' && isMediaRecorderCompatible() && mediaStream.getVideoTracks && !mediaStream.getVideoTracks().length) {
            // Firefox supports both audio/video in single blob
            mediaType.video = false;
        }

        if (!mediaType.audio && !mediaType.video) {
            throw 'MediaStream must have either audio or video tracks.';
        }

        if (!!mediaType.audio) {
            recorderType = null;
            if (typeof mediaType.audio === 'function') {
                recorderType = mediaType.audio;
            }
            this.audioRecorder = new RecordRTC(mediaStream, {
                type: 'audio',
                bufferSize: this.bufferSize,
                sampleRate: this.sampleRate,
                numberOfAudioChannels: this.numberOfAudioChannels || 2,
                disableLogs: this.disableLogs,
                recorderType: recorderType,
                mimeType: mimeType.audio
            });

            if (!mediaType.video) {
                this.audioRecorder.startRecording();
            }
        }

        if (!!mediaType.video) {
            recorderType = null;
            if (typeof mediaType.video === 'function') {
                recorderType = mediaType.video;
            }

            var newStream = mediaStream;

            if (isMediaRecorderCompatible() && !!mediaType.audio && typeof mediaType.audio === 'function') {
                var videoTrack = mediaStream.getVideoTracks()[0];

                if (!!navigator.mozGetUserMedia) {
                    newStream = new MediaStream();
                    newStream.addTrack(videoTrack);

                    if (recorderType && recorderType === WhammyRecorder) {
                        // Firefox does NOT support webp-encoding yet
                        recorderType = MediaStreamRecorder;
                    }
                } else {
                    newStream = new MediaStream([videoTrack]);
                }
            }

            this.videoRecorder = new RecordRTC(newStream, {
                type: 'video',
                video: this.video,
                canvas: this.canvas,
                frameInterval: this.frameInterval || 10,
                disableLogs: this.disableLogs,
                recorderType: recorderType,
                mimeType: mimeType.video
            });

            if (!mediaType.audio) {
                this.videoRecorder.startRecording();
            }
        }

        if (!!mediaType.audio && !!mediaType.video) {
            var self = this;
            if (isMediaRecorderCompatible()) {
                self.audioRecorder = null;
                self.videoRecorder.startRecording();
            } else {
                self.videoRecorder.initRecorder(function() {
                    self.audioRecorder.initRecorder(function() {
                        // Both recorders are ready to record things accurately
                        self.videoRecorder.startRecording();
                        self.audioRecorder.startRecording();
                    });
                });
            }
        }

        if (!!mediaType.gif) {
            recorderType = null;
            if (typeof mediaType.gif === 'function') {
                recorderType = mediaType.gif;
            }
            this.gifRecorder = new RecordRTC(mediaStream, {
                type: 'gif',
                frameRate: this.frameRate || 200,
                quality: this.quality || 10,
                disableLogs: this.disableLogs,
                recorderType: recorderType,
                mimeType: mimeType.gif
            });
            this.gifRecorder.startRecording();
        }
    };

    /**
     * This method stops recording.
     * @param {function} callback - Callback function is invoked when all encoders finished their jobs.
     * @method
     * @memberof MRecordRTC
     * @example
     * recorder.stopRecording(function(recording){
     *     var audioBlob = recording.audio;
     *     var videoBlob = recording.video;
     *     var gifBlob   = recording.gif;
     * });
     */
    this.stopRecording = function(callback) {
        callback = callback || function() {};

        if (this.audioRecorder) {
            this.audioRecorder.stopRecording(function(blobURL) {
                callback(blobURL, 'audio');
            });
        }

        if (this.videoRecorder) {
            this.videoRecorder.stopRecording(function(blobURL) {
                callback(blobURL, 'video');
            });
        }

        if (this.gifRecorder) {
            this.gifRecorder.stopRecording(function(blobURL) {
                callback(blobURL, 'gif');
            });
        }
    };

    /**
     * This method pauses recording.
     * @method
     * @memberof MRecordRTC
     * @example
     * recorder.pauseRecording();
     */
    this.pauseRecording = function() {
        if (this.audioRecorder) {
            this.audioRecorder.pauseRecording();
        }

        if (this.videoRecorder) {
            this.videoRecorder.pauseRecording();
        }

        if (this.gifRecorder) {
            this.gifRecorder.pauseRecording();
        }
    };

    /**
     * This method resumes recording.
     * @method
     * @memberof MRecordRTC
     * @example
     * recorder.resumeRecording();
     */
    this.resumeRecording = function() {
        if (this.audioRecorder) {
            this.audioRecorder.resumeRecording();
        }

        if (this.videoRecorder) {
            this.videoRecorder.resumeRecording();
        }

        if (this.gifRecorder) {
            this.gifRecorder.resumeRecording();
        }
    };

    /**
     * This method can be used to manually get all recorded blobs.
     * @param {function} callback - All recorded blobs are passed back to the "callback" function.
     * @method
     * @memberof MRecordRTC
     * @example
     * recorder.getBlob(function(recording){
     *     var audioBlob = recording.audio;
     *     var videoBlob = recording.video;
     *     var gifBlob   = recording.gif;
     * });
     * // or
     * var audioBlob = recorder.getBlob().audio;
     * var videoBlob = recorder.getBlob().video;
     */
    this.getBlob = function(callback) {
        var output = {};

        if (this.audioRecorder) {
            output.audio = this.audioRecorder.getBlob();
        }

        if (this.videoRecorder) {
            output.video = this.videoRecorder.getBlob();
        }

        if (this.gifRecorder) {
            output.gif = this.gifRecorder.getBlob();
        }

        if (callback) {
            callback(output);
        }

        return output;
    };

    /**
     * This method can be used to manually get all recorded blobs' DataURLs.
     * @param {function} callback - All recorded blobs' DataURLs are passed back to the "callback" function.
     * @method
     * @memberof MRecordRTC
     * @example
     * recorder.getDataURL(function(recording){
     *     var audioDataURL = recording.audio;
     *     var videoDataURL = recording.video;
     *     var gifDataURL   = recording.gif;
     * });
     */
    this.getDataURL = function(callback) {
        this.getBlob(function(blob) {
            getDataURL(blob.audio, function(_audioDataURL) {
                getDataURL(blob.video, function(_videoDataURL) {
                    callback({
                        audio: _audioDataURL,
                        video: _videoDataURL
                    });
                });
            });
        });

        function getDataURL(blob, callback00) {
            if (typeof Worker !== 'undefined') {
                var webWorker = processInWebWorker(function readFile(_blob) {
                    postMessage(new FileReaderSync().readAsDataURL(_blob));
                });

                webWorker.onmessage = function(event) {
                    callback00(event.data);
                };

                webWorker.postMessage(blob);
            } else {
                var reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onload = function(event) {
                    callback00(event.target.result);
                };
            }
        }

        function processInWebWorker(_function) {
            var blob = URL.createObjectURL(new Blob([_function.toString(),
                'this.onmessage =  function (e) {' + _function.name + '(e.data);}'
            ], {
                type: 'application/javascript'
            }));

            var worker = new Worker(blob);
            var url;
            if (typeof URL !== 'undefined') {
                url = URL;
            } else if (typeof webkitURL !== 'undefined') {
                url = webkitURL;
            } else {
                throw 'Neither URL nor webkitURL detected.';
            }
            url.revokeObjectURL(blob);
            return worker;
        }
    };

    /**
     * This method can be used to ask {@link MRecordRTC} to write all recorded blobs into IndexedDB storage.
     * @method
     * @memberof MRecordRTC
     * @example
     * recorder.writeToDisk();
     */
    this.writeToDisk = function() {
        RecordRTC.writeToDisk({
            audio: this.audioRecorder,
            video: this.videoRecorder,
            gif: this.gifRecorder
        });
    };

    /**
     * This method can be used to invoke a save-as dialog for all recorded blobs.
     * @param {object} args - {audio: 'audio-name', video: 'video-name', gif: 'gif-name'}
     * @method
     * @memberof MRecordRTC
     * @example
     * recorder.save({
     *     audio: 'audio-file-name',
     *     video: 'video-file-name',
     *     gif  : 'gif-file-name'
     * });
     */
    this.save = function(args) {
        args = args || {
            audio: true,
            video: true,
            gif: true
        };

        if (!!args.audio && this.audioRecorder) {
            this.audioRecorder.save(typeof args.audio === 'string' ? args.audio : '');
        }

        if (!!args.video && this.videoRecorder) {
            this.videoRecorder.save(typeof args.video === 'string' ? args.video : '');
        }
        if (!!args.gif && this.gifRecorder) {
            this.gifRecorder.save(typeof args.gif === 'string' ? args.gif : '');
        }
    };
}

/**
 * This method can be used to get all recorded blobs from IndexedDB storage.
 * @param {string} type - 'all' or 'audio' or 'video' or 'gif'
 * @param {function} callback - Callback function to get all stored blobs.
 * @method
 * @memberof MRecordRTC
 * @example
 * MRecordRTC.getFromDisk('all', function(dataURL, type){
 *     if(type === 'audio') { }
 *     if(type === 'video') { }
 *     if(type === 'gif')   { }
 * });
 */
MRecordRTC.getFromDisk = RecordRTC.getFromDisk;

/**
 * This method can be used to store recorded blobs into IndexedDB storage.
 * @param {object} options - {audio: Blob, video: Blob, gif: Blob}
 * @method
 * @memberof MRecordRTC
 * @example
 * MRecordRTC.writeToDisk({
 *     audio: audioBlob,
 *     video: videoBlob,
 *     gif  : gifBlob
 * });
 */
MRecordRTC.writeToDisk = RecordRTC.writeToDisk;

if (typeof RecordRTC !== 'undefined') {
    RecordRTC.MRecordRTC = MRecordRTC;
}

var browserFakeUserAgent = 'Fake/5.0 (FakeOS) AppleWebKit/123 (KHTML, like Gecko) Fake/12.3.4567.89 Fake/123.45';

(function(that) {
    if (!that) {
        return;
    }

    if (typeof window !== 'undefined') {
        return;
    }

    if (typeof global === 'undefined') {
        return;
    }

    global.navigator = {
        userAgent: browserFakeUserAgent,
        getUserMedia: function() {}
    };

    if (!global.console) {
        global.console = {};
    }

    if (typeof global.console.debug === 'undefined') {
        global.console.debug = global.console.info = global.console.error = global.console.log = global.console.log || function() {
            console.log(arguments);
        };
    }

    if (typeof document === 'undefined') {
        /*global document:true */
        that.document = {};

        document.createElement = document.captureStream = document.mozCaptureStream = function() {
            var obj = {
                getContext: function() {
                    return obj;
                },
                play: function() {},
                pause: function() {},
                drawImage: function() {},
                toDataURL: function() {
                    return '';
                }
            };
            return obj;
        };

        that.HTMLVideoElement = function() {};
    }

    if (typeof location === 'undefined') {
        /*global location:true */
        that.location = {
            protocol: 'file:',
            href: '',
            hash: ''
        };
    }

    if (typeof screen === 'undefined') {
        /*global screen:true */
        that.screen = {
            width: 0,
            height: 0
        };
    }

    if (typeof URL === 'undefined') {
        /*global screen:true */
        that.URL = {
            createObjectURL: function() {
                return '';
            },
            revokeObjectURL: function() {
                return '';
            }
        };
    }

    /*global window:true */
    that.window = global;
})(typeof global !== 'undefined' ? global : null);

// _____________________________
// Cross-Browser-Declarations.js

// animation-frame used in WebM recording

/*jshint -W079 */
var requestAnimationFrame = window.requestAnimationFrame;
if (typeof requestAnimationFrame === 'undefined') {
    if (typeof webkitRequestAnimationFrame !== 'undefined') {
        /*global requestAnimationFrame:true */
        requestAnimationFrame = webkitRequestAnimationFrame;
    }

    if (typeof mozRequestAnimationFrame !== 'undefined') {
        /*global requestAnimationFrame:true */
        requestAnimationFrame = mozRequestAnimationFrame;
    }
}

/*jshint -W079 */
var cancelAnimationFrame = window.cancelAnimationFrame;
if (typeof cancelAnimationFrame === 'undefined') {
    if (typeof webkitCancelAnimationFrame !== 'undefined') {
        /*global cancelAnimationFrame:true */
        cancelAnimationFrame = webkitCancelAnimationFrame;
    }

    if (typeof mozCancelAnimationFrame !== 'undefined') {
        /*global cancelAnimationFrame:true */
        cancelAnimationFrame = mozCancelAnimationFrame;
    }
}

// WebAudio API representer
var AudioContext = window.AudioContext;

if (typeof AudioContext === 'undefined') {
    if (typeof webkitAudioContext !== 'undefined') {
        /*global AudioContext:true */
        AudioContext = webkitAudioContext;
    }

    if (typeof mozAudioContext !== 'undefined') {
        /*global AudioContext:true */
        AudioContext = mozAudioContext;
    }
}

/*jshint -W079 */
var URL = window.URL;

if (typeof URL === 'undefined' && typeof webkitURL !== 'undefined') {
    /*global URL:true */
    URL = webkitURL;
}

if (typeof navigator !== 'undefined' && typeof navigator.getUserMedia === 'undefined') { // maybe window.navigator?
    if (typeof navigator.webkitGetUserMedia !== 'undefined') {
        navigator.getUserMedia = navigator.webkitGetUserMedia;
    }

    if (typeof navigator.mozGetUserMedia !== 'undefined') {
        navigator.getUserMedia = navigator.mozGetUserMedia;
    }
}

var isEdge = navigator.userAgent.indexOf('Edge') !== -1 && (!!navigator.msSaveBlob || !!navigator.msSaveOrOpenBlob);
var isOpera = !!window.opera || navigator.userAgent.indexOf('OPR/') !== -1;
var isChrome = !isOpera && !isEdge && !!navigator.webkitGetUserMedia;

var MediaStream = window.MediaStream;

if (typeof MediaStream === 'undefined' && typeof webkitMediaStream !== 'undefined') {
    MediaStream = webkitMediaStream;
}

/*global MediaStream:true */
if (typeof MediaStream !== 'undefined') {
    if (!('getVideoTracks' in MediaStream.prototype)) {
        MediaStream.prototype.getVideoTracks = function() {
            if (!this.getTracks) {
                return [];
            }

            var tracks = [];
            this.getTracks.forEach(function(track) {
                if (track.kind.toString().indexOf('video') !== -1) {
                    tracks.push(track);
                }
            });
            return tracks;
        };

        MediaStream.prototype.getAudioTracks = function() {
            if (!this.getTracks) {
                return [];
            }

            var tracks = [];
            this.getTracks.forEach(function(track) {
                if (track.kind.toString().indexOf('audio') !== -1) {
                    tracks.push(track);
                }
            });
            return tracks;
        };
    }

    if (!('stop' in MediaStream.prototype)) {
        MediaStream.prototype.stop = function() {
            this.getAudioTracks().forEach(function(track) {
                if (!!track.stop) {
                    track.stop();
                }
            });

            this.getVideoTracks().forEach(function(track) {
                if (!!track.stop) {
                    track.stop();
                }
            });
        };
    }
}

// below function via: http://goo.gl/B3ae8c
/**
 * @param {number} bytes - Pass bytes and get formafted string.
 * @returns {string} - formafted string
 * @example
 * bytesToSize(1024*1024*5) === '5 GB'
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 */
function bytesToSize(bytes) {
    var k = 1000;
    var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) {
        return '0 Bytes';
    }
    var i = parseInt(Math.floor(Math.log(bytes) / Math.log(k)), 10);
    return (bytes / Math.pow(k, i)).toPrecision(3) + ' ' + sizes[i];
}

/**
 * @param {Blob} file - File or Blob object. This parameter is required.
 * @param {string} fileName - Optional file name e.g. "Recorded-Video.webm"
 * @example
 * invokeSaveAsDialog(blob or file, [optional] fileName);
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 */
function invokeSaveAsDialog(file, fileName) {
    if (!file) {
        throw 'Blob object is required.';
    }

    if (!file.type) {
        try {
            file.type = 'video/webm';
        } catch (e) {}
    }

    var fileExtension = (file.type || 'video/webm').split('/')[1];

    if (fileName && fileName.indexOf('.') !== -1) {
        var splitted = fileName.split('.');
        fileName = splitted[0];
        fileExtension = splitted[1];
    }

    var fileFullName = (fileName || (Math.round(Math.random() * 9999999999) + 888888888)) + '.' + fileExtension;

    if (typeof navigator.msSaveOrOpenBlob !== 'undefined') {
        return navigator.msSaveOrOpenBlob(file, fileFullName);
    } else if (typeof navigator.msSaveBlob !== 'undefined') {
        return navigator.msSaveBlob(file, fileFullName);
    }

    var hyperlink = document.createElement('a');
    hyperlink.href = URL.createObjectURL(file);
    hyperlink.target = '_blank';
    hyperlink.download = fileFullName;

    if (!!navigator.mozGetUserMedia) {
        hyperlink.onclick = function() {
            (document.body || document.documentElement).removeChild(hyperlink);
        };
        (document.body || document.documentElement).appendChild(hyperlink);
    }

    var evt = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
    });

    hyperlink.dispatchEvent(evt);

    if (!navigator.mozGetUserMedia) {
        URL.revokeObjectURL(hyperlink.href);
    }
}

// __________ (used to handle stuff like http://goo.gl/xmE5eg) issue #129
// Storage.js

/**
 * Storage is a standalone object used by {@link RecordRTC} to store reusable objects e.g. "new AudioContext".
 * @license {@link https://github.com/muaz-khan/RecordRTC#license|MIT}
 * @author {@link http://www.MuazKhan.com|Muaz Khan}
 * @example
 * Storage.AudioContext === webkitAudioContext
 * @property {webkitAudioContext} AudioContext - Keeps a reference to AudioContext object.
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 */

var Storage = {};

if (typeof AudioContext !== 'undefined') {
    Storage.AudioContext = AudioContext;
} else if (typeof webkitAudioContext !== 'undefined') {
    Storage.AudioContext = webkitAudioContext;
}

if (typeof RecordRTC !== 'undefined') {
    RecordRTC.Storage = Storage;
}

function isMediaRecorderCompatible() {
    var isOpera = !!window.opera || navigator.userAgent.indexOf(' OPR/') >= 0;
    var isChrome = !!window.chrome && !isOpera;
    var isFirefox = typeof window.InstallTrigger !== 'undefined';

    if (isFirefox) {
        return true;
    }

    var nVer = navigator.appVersion;
    var nAgt = navigator.userAgent;
    var fullVersion = '' + parseFloat(navigator.appVersion);
    var majorVersion = parseInt(navigator.appVersion, 10);
    var nameOffset, verOffset, ix;

    if (isChrome || isOpera) {
        verOffset = nAgt.indexOf('Chrome');
        fullVersion = nAgt.substring(verOffset + 7);
    }

    // trim the fullVersion string at semicolon/space if present
    if ((ix = fullVersion.indexOf(';')) !== -1) {
        fullVersion = fullVersion.substring(0, ix);
    }

    if ((ix = fullVersion.indexOf(' ')) !== -1) {
        fullVersion = fullVersion.substring(0, ix);
    }

    majorVersion = parseInt('' + fullVersion, 10);

    if (isNaN(majorVersion)) {
        fullVersion = '' + parseFloat(navigator.appVersion);
        majorVersion = parseInt(navigator.appVersion, 10);
    }

    return majorVersion >= 49;
}

// ______________________
// MediaStreamRecorder.js

// todo: need to show alert boxes for incompatible cases
// encoder only supports 48k/16k mono audio channel

/*
 * Implementation of https://dvcs.w3.org/hg/dap/raw-file/default/media-stream-capture/MediaRecorder.html
 * The MediaRecorder accepts a mediaStream as input source passed from UA. When recorder starts,
 * a MediaEncoder will be created and accept the mediaStream as input source.
 * Encoder will get the raw data by track data changes, encode it by selected MIME Type, then store the encoded in EncodedBufferCache object.
 * The encoded data will be extracted on every timeslice passed from Start function call or by RequestData function.
 * Thread model:
 * When the recorder starts, it creates a "Media Encoder" thread to read data from MediaEncoder object and store buffer in EncodedBufferCache object.
 * Also extract the encoded data and create blobs on every timeslice passed from start function or RequestData function called by UA.
 */

/**
 * MediaStreamRecorder is an abstraction layer for "MediaRecorder API". It is used by {@link RecordRTC} to record MediaStream(s) in Firefox.
 * @summary Runs top over MediaRecorder API.
 * @license {@link https://github.com/muaz-khan/RecordRTC#license|MIT}
 * @author {@link http://www.MuazKhan.com|Muaz Khan}
 * @typedef MediaStreamRecorder
 * @class
 * @example
 * var options = {
 *     mimeType: 'video/mp4', // audio/ogg or video/webm
 *     audioBitsPerSecond : 256 * 8 * 1024,
 *     videoBitsPerSecond : 256 * 8 * 1024,
 *     bitsPerSecond: 256 * 8 * 1024,  // if this is provided, skip above two
 *     getNativeBlob: true // by default it is false
 * }
 * var recorder = new MediaStreamRecorder(MediaStream, options);
 * recorder.record();
 * recorder.stop(function(blob) {
 *     video.src = URL.createObjectURL(blob);
 *
 *     // or
 *     var blob = recorder.blob;
 * });
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 * @param {MediaStream} mediaStream - MediaStream object fetched using getUserMedia API or generated using captureStreamUntilEnded or WebAudio API.
 * @param {object} config - {disableLogs:true, initCallback: function, mimeType: "video/webm", onAudioProcessStarted: function}
 */

function MediaStreamRecorder(mediaStream, config) {
    var self = this;

    config = config || {
        // bitsPerSecond: 256 * 8 * 1024,
        mimeType: 'video/webm'
    };

    if (config.type === 'audio') {
        if (mediaStream.getVideoTracks().length && mediaStream.getAudioTracks().length) {
            var stream;
            if (!!navigator.mozGetUserMedia) {
                stream = new MediaStream();
                stream.addTrack(mediaStream.getAudioTracks()[0]);
            } else {
                // webkitMediaStream
                stream = new MediaStream(mediaStream.getAudioTracks());
            }
            mediaStream = stream;
        }

        if (!config.mimeType || config.mimeType.toString().toLowerCase().indexOf('audio') === -1) {
            config.mimeType = isChrome ? 'audio/webm' : 'audio/ogg';
        }

        if (config.mimeType && config.mimeType.toString().toLowerCase() !== 'audio/ogg' && !!navigator.mozGetUserMedia) {
            // forcing better codecs on Firefox (via #166)
            config.mimeType = 'audio/ogg';
        }
    }

    /**
     * This method records MediaStream.
     * @method
     * @memberof MediaStreamRecorder
     * @example
     * recorder.record();
     */
    this.record = function() {
        self.blob = null;

        var recorderHints = config;

        if (!config.disableLogs) {
            console.log('Passing following config over MediaRecorder API.', recorderHints);
        }

        if (mediaRecorder) {
            // mandatory to make sure Firefox doesn't fails to record streams 3-4 times without reloading the page.
            mediaRecorder = null;
        }

        if (isChrome && !isMediaRecorderCompatible()) {
            // to support video-only recording on stable
            recorderHints = 'video/vp8';
        }

        // http://dxr.mozilla.org/mozilla-central/source/content/media/MediaRecorder.cpp
        // https://wiki.mozilla.org/Gecko:MediaRecorder
        // https://dvcs.w3.org/hg/dap/raw-file/default/media-stream-capture/MediaRecorder.html

        // starting a recording session; which will initiate "Reading Thread"
        // "Reading Thread" are used to prevent main-thread blocking scenarios
        try {
            mediaRecorder = new MediaRecorder(mediaStream, recorderHints);
        } catch (e) {
            mediaRecorder = new MediaRecorder(mediaStream);
        }

        if ('canRecordMimeType' in mediaRecorder && mediaRecorder.canRecordMimeType(config.mimeType) === false) {
            if (!config.disableLogs) {
                console.warn('MediaRecorder API seems unable to record mimeType:', config.mimeType);
            }
        }

        // i.e. stop recording when <video> is paused by the user; and auto restart recording 
        // when video is resumed. E.g. yourStream.getVideoTracks()[0].muted = true; // it will auto-stop recording.
        mediaRecorder.ignoreMutedMedia = config.ignoreMutedMedia || false;

        // Dispatching OnDataAvailable Handler
        mediaRecorder.ondataavailable = function(e) {
            if (self.dontFireOnDataAvailableEvent) {
                return;
            }

            if (!e.data || !e.data.size || e.data.size < 100 || self.blob) {
                return;
            }

            /**
             * @property {Blob} blob - Recorded frames in video/webm blob.
             * @memberof MediaStreamRecorder
             * @example
             * recorder.stop(function() {
             *     var blob = recorder.blob;
             * });
             */
            self.blob = config.getNativeBlob ? e.data : new Blob([e.data], {
                type: config.mimeType || 'video/webm'
            });

            if (self.recordingCallback) {
                self.recordingCallback(self.blob);
                self.recordingCallback = null;
            }
        };

        mediaRecorder.onerror = function(error) {
            if (!config.disableLogs) {
                if (error.name === 'InvalidState') {
                    console.error('The MediaRecorder is not in a state in which the proposed operation is allowed to be executed.');
                } else if (error.name === 'OutOfMemory') {
                    console.error('The UA has exhaused the available memory. User agents SHOULD provide as much additional information as possible in the message attribute.');
                } else if (error.name === 'IllegalStreamModification') {
                    console.error('A modification to the stream has occurred that makes it impossible to continue recording. An example would be the addition of a Track while recording is occurring. User agents SHOULD provide as much additional information as possible in the message attribute.');
                } else if (error.name === 'OtherRecordingError') {
                    console.error('Used for an fatal error other than those listed above. User agents SHOULD provide as much additional information as possible in the message attribute.');
                } else if (error.name === 'GenericError') {
                    console.error('The UA cannot provide the codec or recording option that has been requested.', error);
                } else {
                    console.error('MediaRecorder Error', error);
                }
            }

            // When the stream is "ended" set recording to 'inactive' 
            // and stop gathering data. Callers should not rely on 
            // exactness of the timeSlice value, especially 
            // if the timeSlice value is small. Callers should 
            // consider timeSlice as a minimum value

            if (mediaRecorder.state !== 'inactive' && mediaRecorder.state !== 'stopped') {
                mediaRecorder.stop();
            }
        };

        // void start(optional long mTimeSlice)
        // The interval of passing encoded data from EncodedBufferCache to onDataAvailable
        // handler. "mTimeSlice < 0" means Session object does not push encoded data to
        // onDataAvailable, instead, it passive wait the client side pull encoded data
        // by calling requestData API.
        mediaRecorder.start(3.6e+6);

        // Start recording. If timeSlice has been provided, mediaRecorder will
        // raise a dataavailable event containing the Blob of collected data on every timeSlice milliseconds.
        // If timeSlice isn't provided, UA should call the RequestData to obtain the Blob data, also set the mTimeSlice to zero.

        if (config.onAudioProcessStarted) {
            config.onAudioProcessStarted();
        }

        if (config.initCallback) {
            config.initCallback();
        }
    };

    /**
     * This method stops recording MediaStream.
     * @param {function} callback - Callback function, that is used to pass recorded blob back to the callee.
     * @method
     * @memberof MediaStreamRecorder
     * @example
     * recorder.stop(function(blob) {
     *     video.src = URL.createObjectURL(blob);
     * });
     */
    this.stop = function(callback) {
        if (!mediaRecorder) {
            return;
        }

        this.recordingCallback = function(blob) {
            mediaRecorder = null;

            if (callback) {
                callback(blob);
            }
        };

        // mediaRecorder.state === 'recording' means that media recorder is associated with "session"
        // mediaRecorder.state === 'stopped' means that media recorder is detached from the "session" ... in this case; "session" will also be deleted.

        if (mediaRecorder.state === 'recording') {
            // "stop" method auto invokes "requestData"!
            // mediaRecorder.requestData();
            mediaRecorder.stop();
        }
    };

    /**
     * This method pauses the recording process.
     * @method
     * @memberof MediaStreamRecorder
     * @example
     * recorder.pause();
     */
    this.pause = function() {
        if (!mediaRecorder) {
            return;
        }

        if (mediaRecorder.state === 'recording') {
            mediaRecorder.pause();
        }
    };

    /**
     * This method resumes the recording process.
     * @method
     * @memberof MediaStreamRecorder
     * @example
     * recorder.resume();
     */
    this.resume = function() {
        if (this.dontFireOnDataAvailableEvent) {
            this.dontFireOnDataAvailableEvent = false;

            var disableLogs = config.disableLogs;
            config.disableLogs = true;
            this.record();
            config.disableLogs = disableLogs;
            return;
        }

        if (!mediaRecorder) {
            return;
        }

        if (mediaRecorder.state === 'paused') {
            mediaRecorder.resume();
        }
    };

    /**
     * This method resets currently recorded data.
     * @method
     * @memberof MediaStreamRecorder
     * @example
     * recorder.clearRecordedData();
     */
    this.clearRecordedData = function() {
        if (!mediaRecorder) {
            return;
        }

        this.pause();

        this.dontFireOnDataAvailableEvent = true;
        this.stop();
    };

    // Reference to "MediaRecorder" object
    var mediaRecorder;

    function isMediaStreamActive() {
        if ('active' in mediaStream) {
            if (!mediaStream.active) {
                return false;
            }
        } else if ('ended' in mediaStream) { // old hack
            if (mediaStream.ended) {
                return false;
            }
        }
        return true;
    }

    var self = this;

    // this method checks if media stream is stopped
    // or any track is ended.
    (function looper() {
        if (!mediaRecorder) {
            return;
        }

        if (isMediaStreamActive() === false) {
            if (!config.disableLogs) {
                console.log('MediaStream seems stopped.');
            }
            self.stop();
            return;
        }

        setTimeout(looper, 1000); // check every second
    })();
}

if (typeof RecordRTC !== 'undefined') {
    RecordRTC.MediaStreamRecorder = MediaStreamRecorder;
}

// source code from: http://typedarray.org/wp-content/projects/WebAudioRecorder/script.js
// https://github.com/mattdiamond/Recorderjs#license-mit
// ______________________
// StereoAudioRecorder.js

/**
 * StereoAudioRecorder is a standalone class used by {@link RecordRTC} to bring "stereo" audio-recording in chrome.
 * @summary JavaScript standalone object for stereo audio recording.
 * @license {@link https://github.com/muaz-khan/RecordRTC#license|MIT}
 * @author {@link http://www.MuazKhan.com|Muaz Khan}
 * @typedef StereoAudioRecorder
 * @class
 * @example
 * var recorder = new StereoAudioRecorder(MediaStream, {
 *     sampleRate: 44100,
 *     bufferSize: 4096
 * });
 * recorder.record();
 * recorder.stop(function(blob) {
 *     video.src = URL.createObjectURL(blob);
 * });
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 * @param {MediaStream} mediaStream - MediaStream object fetched using getUserMedia API or generated using captureStreamUntilEnded or WebAudio API.
 * @param {object} config - {sampleRate: 44100, bufferSize: 4096, numberOfAudioChannels: 1, etc.}
 */

function StereoAudioRecorder(mediaStream, config) {
    if (!mediaStream.getAudioTracks().length) {
        throw 'Your stream has no audio tracks.';
    }

    config = config || {};

    var self = this;

    // variables
    var leftchannel = [];
    var rightchannel = [];
    var recording = false;
    var recordingLength = 0;
    var jsAudioNode;

    var numberOfAudioChannels = 2;

    // backward compatibility
    if (config.leftChannel === true) {
        numberOfAudioChannels = 1;
    }

    if (config.numberOfAudioChannels === 1) {
        numberOfAudioChannels = 1;
    }

    if (!config.disableLogs) {
        console.debug('StereoAudioRecorder is set to record number of channels: ', numberOfAudioChannels);
    }

    function isMediaStreamActive() {
        if ('active' in mediaStream) {
            if (!mediaStream.active) {
                return false;
            }
        } else if ('ended' in mediaStream) { // old hack
            if (mediaStream.ended) {
                return false;
            }
        }
        return true;
    }

    /**
     * This method records MediaStream.
     * @method
     * @memberof StereoAudioRecorder
     * @example
     * recorder.record();
     */
    this.record = function() {
        if (isMediaStreamActive() === false) {
            throw 'Please make sure MediaStream is active.';
        }

        // reset the buffers for the new recording
        leftchannel.length = rightchannel.length = 0;
        recordingLength = 0;

        if (audioInput) {
            audioInput.connect(jsAudioNode);
        }

        // to prevent self audio to be connected with speakers
        // jsAudioNode.connect(context.destination);

        isAudioProcessStarted = isPaused = false;
        recording = true;
    };

    function mergeLeftRightBuffers(config, callback) {
        function mergeAudioBuffers(config, cb) {
            var numberOfAudioChannels = config.numberOfAudioChannels;

            // todo: "slice(0)" --- is it causes loop? Should be removed?
            var leftBuffers = config.leftBuffers.slice(0);
            var rightBuffers = config.rightBuffers.slice(0);
            var sampleRate = config.sampleRate;
            var internalInterleavedLength = config.internalInterleavedLength;

            if (numberOfAudioChannels === 2) {
                leftBuffers = mergeBuffers(leftBuffers, internalInterleavedLength);
                rightBuffers = mergeBuffers(rightBuffers, internalInterleavedLength);
            }

            if (numberOfAudioChannels === 1) {
                leftBuffers = mergeBuffers(leftBuffers, internalInterleavedLength);
            }

            function mergeBuffers(channelBuffer, rLength) {
                var result = new Float64Array(rLength);
                var offset = 0;
                var lng = channelBuffer.length;

                for (var i = 0; i < lng; i++) {
                    var buffer = channelBuffer[i];
                    result.set(buffer, offset);
                    offset += buffer.length;
                }

                return result;
            }

            function interleave(leftChannel, rightChannel) {
                var length = leftChannel.length + rightChannel.length;

                var result = new Float64Array(length);

                var inputIndex = 0;

                for (var index = 0; index < length;) {
                    result[index++] = leftChannel[inputIndex];
                    result[index++] = rightChannel[inputIndex];
                    inputIndex++;
                }
                return result;
            }

            function writeUTFBytes(view, offset, string) {
                var lng = string.length;
                for (var i = 0; i < lng; i++) {
                    view.setUint8(offset + i, string.charCodeAt(i));
                }
            }

            // interleave both channels together
            var interleaved;

            if (numberOfAudioChannels === 2) {
                interleaved = interleave(leftBuffers, rightBuffers);
            }

            if (numberOfAudioChannels === 1) {
                interleaved = leftBuffers;
            }

            var interleavedLength = interleaved.length;

            // create wav file
            var resultingBufferLength = 44 + interleavedLength * 2;

            var buffer = new ArrayBuffer(resultingBufferLength);

            var view = new DataView(buffer);

            // RIFF chunk descriptor/identifier 
            writeUTFBytes(view, 0, 'RIFF');

            // RIFF chunk length
            view.setUint32(4, 44 + interleavedLength * 2, true);

            // RIFF type 
            writeUTFBytes(view, 8, 'WAVE');

            // format chunk identifier 
            // FMT sub-chunk
            writeUTFBytes(view, 12, 'fmt ');

            // format chunk length 
            view.setUint32(16, 16, true);

            // sample format (raw)
            view.setUint16(20, 1, true);

            // stereo (2 channels)
            view.setUint16(22, numberOfAudioChannels, true);

            // sample rate 
            view.setUint32(24, sampleRate, true);

            // byte rate (sample rate * block align)
            view.setUint32(28, sampleRate * 2, true);

            // block align (channel count * bytes per sample) 
            view.setUint16(32, numberOfAudioChannels * 2, true);

            // bits per sample 
            view.setUint16(34, 16, true);

            // data sub-chunk
            // data chunk identifier 
            writeUTFBytes(view, 36, 'data');

            // data chunk length 
            view.setUint32(40, interleavedLength * 2, true);

            // write the PCM samples
            var lng = interleavedLength;
            var index = 44;
            var volume = 1;
            for (var i = 0; i < lng; i++) {
                view.setInt16(index, interleaved[i] * (0x7FFF * volume), true);
                index += 2;
            }

            if (cb) {
                return cb({
                    buffer: buffer,
                    view: view
                });
            }

            postMessage({
                buffer: buffer,
                view: view
            });
        }

        if (!isChrome) {
            // its Microsoft Edge
            mergeAudioBuffers(config, function(data) {
                callback(data.buffer, data.view);
            });
            return;
        }


        var webWorker = processInWebWorker(mergeAudioBuffers);

        webWorker.onmessage = function(event) {
            callback(event.data.buffer, event.data.view);

            // release memory
            URL.revokeObjectURL(webWorker.workerURL);
        };

        webWorker.postMessage(config);
    }

    function processInWebWorker(_function) {
        var workerURL = URL.createObjectURL(new Blob([_function.toString(),
            ';this.onmessage =  function (e) {' + _function.name + '(e.data);}'
        ], {
            type: 'application/javascript'
        }));

        var worker = new Worker(workerURL);
        worker.workerURL = workerURL;
        return worker;
    }

    /**
     * This method stops recording MediaStream.
     * @param {function} callback - Callback function, that is used to pass recorded blob back to the callee.
     * @method
     * @memberof StereoAudioRecorder
     * @example
     * recorder.stop(function(blob) {
     *     video.src = URL.createObjectURL(blob);
     * });
     */
    this.stop = function(callback) {
        // stop recording
        recording = false;

        // to make sure onaudioprocess stops firing
        // audioInput.disconnect();

        mergeLeftRightBuffers({
            sampleRate: sampleRate,
            numberOfAudioChannels: numberOfAudioChannels,
            internalInterleavedLength: recordingLength,
            leftBuffers: leftchannel,
            rightBuffers: numberOfAudioChannels === 1 ? [] : rightchannel
        }, function(buffer, view) {
            /**
             * @property {Blob} blob - The recorded blob object.
             * @memberof StereoAudioRecorder
             * @example
             * recorder.stop(function(){
             *     var blob = recorder.blob;
             * });
             */
            self.blob = new Blob([view], {
                type: 'audio/wav'
            });

            /**
             * @property {ArrayBuffer} buffer - The recorded buffer object.
             * @memberof StereoAudioRecorder
             * @example
             * recorder.stop(function(){
             *     var buffer = recorder.buffer;
             * });
             */
            self.buffer = new ArrayBuffer(view.buffer.byteLength);

            /**
             * @property {DataView} view - The recorded data-view object.
             * @memberof StereoAudioRecorder
             * @example
             * recorder.stop(function(){
             *     var view = recorder.view;
             * });
             */
            self.view = view;

            self.sampleRate = sampleRate;
            self.bufferSize = bufferSize;

            // recorded audio length
            self.length = recordingLength;

            if (callback) {
                callback();
            }

            isAudioProcessStarted = false;
        });
    };

    if (!Storage.AudioContextConstructor) {
        Storage.AudioContextConstructor = new Storage.AudioContext();
    }

    var context = Storage.AudioContextConstructor;

    // creates an audio node from the microphone incoming stream
    var audioInput = context.createMediaStreamSource(mediaStream);

    var legalBufferValues = [0, 256, 512, 1024, 2048, 4096, 8192, 16384];

    /**
     * From the spec: This value controls how frequently the audioprocess event is
     * dispatched and how many sample-frames need to be processed each call.
     * Lower values for buffer size will result in a lower (better) latency.
     * Higher values will be necessary to avoid audio breakup and glitches
     * The size of the buffer (in sample-frames) which needs to
     * be processed each time onprocessaudio is called.
     * Legal values are (256, 512, 1024, 2048, 4096, 8192, 16384).
     * @property {number} bufferSize - Buffer-size for how frequently the audioprocess event is dispatched.
     * @memberof StereoAudioRecorder
     * @example
     * recorder = new StereoAudioRecorder(mediaStream, {
     *     bufferSize: 4096
     * });
     */

    // "0" means, let chrome decide the most accurate buffer-size for current platform.
    var bufferSize = typeof config.bufferSize === 'undefined' ? 4096 : config.bufferSize;

    if (legalBufferValues.indexOf(bufferSize) === -1) {
        if (!config.disableLogs) {
            console.warn('Legal values for buffer-size are ' + JSON.stringify(legalBufferValues, null, '\t'));
        }
    }

    if (context.createJavaScriptNode) {
        jsAudioNode = context.createJavaScriptNode(bufferSize, numberOfAudioChannels, numberOfAudioChannels);
    } else if (context.createScriptProcessor) {
        jsAudioNode = context.createScriptProcessor(bufferSize, numberOfAudioChannels, numberOfAudioChannels);
    } else {
        throw 'WebAudio API has no support on this browser.';
    }

    // connect the stream to the gain node
    audioInput.connect(jsAudioNode);

    if (!config.bufferSize) {
        bufferSize = jsAudioNode.bufferSize; // device buffer-size
    }

    /**
     * The sample rate (in sample-frames per second) at which the
     * AudioContext handles audio. It is assumed that all AudioNodes
     * in the context run at this rate. In making this assumption,
     * sample-rate converters or "varispeed" processors are not supported
     * in real-time processing.
     * The sampleRate parameter describes the sample-rate of the
     * linear PCM audio data in the buffer in sample-frames per second.
     * An implementation must support sample-rates in at least
     * the range 22050 to 96000.
     * @property {number} sampleRate - Buffer-size for how frequently the audioprocess event is dispatched.
     * @memberof StereoAudioRecorder
     * @example
     * recorder = new StereoAudioRecorder(mediaStream, {
     *     sampleRate: 44100
     * });
     */
    var sampleRate = typeof config.sampleRate !== 'undefined' ? config.sampleRate : context.sampleRate || 44100;

    if (sampleRate < 22050 || sampleRate > 96000) {
        // Ref: http://stackoverflow.com/a/26303918/552182
        if (!config.disableLogs) {
            console.warn('sample-rate must be under range 22050 and 96000.');
        }
    }

    if (!config.disableLogs) {
        console.log('sample-rate', sampleRate);
        console.log('buffer-size', bufferSize);
    }

    var isPaused = false;
    /**
     * This method pauses the recording process.
     * @method
     * @memberof StereoAudioRecorder
     * @example
     * recorder.pause();
     */
    this.pause = function() {
        isPaused = true;
    };

    /**
     * This method resumes the recording process.
     * @method
     * @memberof StereoAudioRecorder
     * @example
     * recorder.resume();
     */
    this.resume = function() {
        if (isMediaStreamActive() === false) {
            throw 'Please make sure MediaStream is active.';
        }

        if (!recording) {
            if (!config.disableLogs) {
                console.info('Seems recording has been restarted.');
            }
            this.record();
            return;
        }

        isPaused = false;
    };

    /**
     * This method resets currently recorded data.
     * @method
     * @memberof StereoAudioRecorder
     * @example
     * recorder.clearRecordedData();
     */
    this.clearRecordedData = function() {
        this.pause();

        leftchannel.length = rightchannel.length = 0;
        recordingLength = 0;
    };

    var isAudioProcessStarted = false;

    function onAudioProcessDataAvailable(e) {
        if (isPaused) {
            return;
        }

        if (isMediaStreamActive() === false) {
            if (!config.disableLogs) {
                console.log('MediaStream seems stopped.');
            }
            jsAudioNode.disconnect();
            recording = false;
        }

        if (!recording) {
            audioInput.disconnect();
            return;
        }

        /**
         * This method is called on "onaudioprocess" event's first invocation.
         * @method {function} onAudioProcessStarted
         * @memberof StereoAudioRecorder
         * @example
         * recorder.onAudioProcessStarted: function() { };
         */
        if (!isAudioProcessStarted) {
            isAudioProcessStarted = true;
            if (config.onAudioProcessStarted) {
                config.onAudioProcessStarted();
            }

            if (config.initCallback) {
                config.initCallback();
            }
        }

        var left = e.inputBuffer.getChannelData(0);

        // we clone the samples
        leftchannel.push(new Float32Array(left));

        if (numberOfAudioChannels === 2) {
            var right = e.inputBuffer.getChannelData(1);
            rightchannel.push(new Float32Array(right));
        }

        recordingLength += bufferSize;
    }

    jsAudioNode.onaudioprocess = onAudioProcessDataAvailable;

    // to prevent self audio to be connected with speakers
    jsAudioNode.connect(context.destination);
}

if (typeof RecordRTC !== 'undefined') {
    RecordRTC.StereoAudioRecorder = StereoAudioRecorder;
}

// _________________
// CanvasRecorder.js

/**
 * CanvasRecorder is a standalone class used by {@link RecordRTC} to bring HTML5-Canvas recording into video WebM. It uses HTML2Canvas library and runs top over {@link Whammy}.
 * @summary HTML2Canvas recording into video WebM.
 * @license {@link https://github.com/muaz-khan/RecordRTC#license|MIT}
 * @author {@link http://www.MuazKhan.com|Muaz Khan}
 * @typedef CanvasRecorder
 * @class
 * @example
 * var recorder = new CanvasRecorder(htmlElement, { disableLogs: true });
 * recorder.record();
 * recorder.stop(function(blob) {
 *     video.src = URL.createObjectURL(blob);
 * });
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 * @param {HTMLElement} htmlElement - querySelector/getElementById/getElementsByTagName[0]/etc.
 * @param {object} config - {disableLogs:true, initCallback: function}
 */

function CanvasRecorder(htmlElement, config) {
    if (typeof html2canvas === 'undefined' && htmlElement.nodeName.toLowerCase() !== 'canvas') {
        throw 'Please link: https://cdn.webrtc-experiment.com/screenshot.js';
    }

    config = config || {};
    if (!config.frameInterval) {
        config.frameInterval = 10;
    }

    // via DetectRTC.js
    var isCanvasSupportsStreamCapturing = false;
    ['captureStream', 'mozCaptureStream', 'webkitCaptureStream'].forEach(function(item) {
        if (item in document.createElement('canvas')) {
            isCanvasSupportsStreamCapturing = true;
        }
    });

    var _isChrome = (!!window.webkitRTCPeerConnection || !!window.webkitGetUserMedia) && !!window.chrome;

    var chromeVersion = 50;
    var matchArray = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);
    if (_isChrome && matchArray && matchArray[2]) {
        chromeVersion = parseInt(matchArray[2], 10);
    }

    if (_isChrome && chromeVersion < 52) {
        isCanvasSupportsStreamCapturing = false;
    }

    var globalCanvas, mediaStreamRecorder;

    if (isCanvasSupportsStreamCapturing) {
        if (!config.disableLogs) {
            console.debug('Your browser supports both MediRecorder API and canvas.captureStream!');
        }

        if (htmlElement instanceof HTMLCanvasElement) {
            globalCanvas = htmlElement;
        } else if (htmlElement instanceof CanvasRenderingContext2D) {
            globalCanvas = htmlElement.canvas;
        } else {
            throw 'Please pass either HTMLCanvasElement or CanvasRenderingContext2D.';
        }
    } else if (!!navigator.mozGetUserMedia) {
        if (!config.disableLogs) {
            console.error('Canvas recording is NOT supported in Firefox.');
        }
    }

    var isRecording;

    /**
     * This method records Canvas.
     * @method
     * @memberof CanvasRecorder
     * @example
     * recorder.record();
     */
    this.record = function() {
        isRecording = true;

        if (isCanvasSupportsStreamCapturing) {
            // CanvasCaptureMediaStream
            var canvasMediaStream;
            if ('captureStream' in globalCanvas) {
                canvasMediaStream = globalCanvas.captureStream(25); // 25 FPS
            } else if ('mozCaptureStream' in globalCanvas) {
                canvasMediaStream = globalCanvas.mozCaptureStream(25);
            } else if ('webkitCaptureStream' in globalCanvas) {
                canvasMediaStream = globalCanvas.webkitCaptureStream(25);
            }

            try {
                var mdStream = new MediaStream();
                mdStream.addTrack(canvasMediaStream.getVideoTracks()[0]);
                canvasMediaStream = mdStream;
            } catch (e) {}

            if (!canvasMediaStream) {
                throw 'captureStream API are NOT available.';
            }

            // Note: Jan 18, 2016 status is that, 
            // Firefox MediaRecorder API can't record CanvasCaptureMediaStream object.
            mediaStreamRecorder = new MediaStreamRecorder(canvasMediaStream, {
                mimeType: 'video/webm'
            });
            mediaStreamRecorder.record();
        } else {
            whammy.frames = [];
            lastTime = new Date().getTime();
            drawCanvasFrame();
        }

        if (config.initCallback) {
            config.initCallback();
        }
    };

    this.getWebPImages = function(callback) {
        if (htmlElement.nodeName.toLowerCase() !== 'canvas') {
            callback();
            return;
        }

        var framesLength = whammy.frames.length;
        whammy.frames.forEach(function(frame, idx) {
            var framesRemaining = framesLength - idx;
            if (!config.disableLogs) {
                console.debug(framesRemaining + '/' + framesLength + ' frames remaining');
            }

            if (config.onEncodingCallback) {
                config.onEncodingCallback(framesRemaining, framesLength);
            }

            var webp = frame.image.toDataURL('image/webp', 1);
            whammy.frames[idx].image = webp;
        });

        if (!config.disableLogs) {
            console.debug('Generating WebM');
        }

        callback();
    };

    /**
     * This method stops recording Canvas.
     * @param {function} callback - Callback function, that is used to pass recorded blob back to the callee.
     * @method
     * @memberof CanvasRecorder
     * @example
     * recorder.stop(function(blob) {
     *     video.src = URL.createObjectURL(blob);
     * });
     */
    this.stop = function(callback) {
        isRecording = false;

        var that = this;

        if (isCanvasSupportsStreamCapturing && mediaStreamRecorder) {
            mediaStreamRecorder.stop(callback);
            return;
        }

        this.getWebPImages(function() {
            /**
             * @property {Blob} blob - Recorded frames in video/webm blob.
             * @memberof CanvasRecorder
             * @example
             * recorder.stop(function() {
             *     var blob = recorder.blob;
             * });
             */
            whammy.compile(function(blob) {
                if (!config.disableLogs) {
                    console.debug('Recording finished!');
                }

                that.blob = blob;

                if (that.blob.forEach) {
                    that.blob = new Blob([], {
                        type: 'video/webm'
                    });
                }

                if (callback) {
                    callback(that.blob);
                }

                whammy.frames = [];
            });
        });
    };

    var isPausedRecording = false;

    /**
     * This method pauses the recording process.
     * @method
     * @memberof CanvasRecorder
     * @example
     * recorder.pause();
     */
    this.pause = function() {
        isPausedRecording = true;
    };

    /**
     * This method resumes the recording process.
     * @method
     * @memberof CanvasRecorder
     * @example
     * recorder.resume();
     */
    this.resume = function() {
        isPausedRecording = false;

        if (!isRecording) {
            this.record();
        }
    };

    /**
     * This method resets currently recorded data.
     * @method
     * @memberof CanvasRecorder
     * @example
     * recorder.clearRecordedData();
     */
    this.clearRecordedData = function() {
        this.pause();
        whammy.frames = [];
    };

    function cloneCanvas() {
        //create a new canvas
        var newCanvas = document.createElement('canvas');
        var context = newCanvas.getContext('2d');

        //set dimensions
        newCanvas.width = htmlElement.width;
        newCanvas.height = htmlElement.height;

        //apply the old canvas to the new one
        context.drawImage(htmlElement, 0, 0);

        //return the new canvas
        return newCanvas;
    }

    function drawCanvasFrame() {
        if (isPausedRecording) {
            lastTime = new Date().getTime();
            return setTimeout(drawCanvasFrame, 500);
        }

        if (htmlElement.nodeName.toLowerCase() === 'canvas') {
            var duration = new Date().getTime() - lastTime;
            // via #206, by Jack i.e. @Seymourr
            lastTime = new Date().getTime();

            whammy.frames.push({
                image: cloneCanvas(),
                duration: duration
            });

            if (isRecording) {
                setTimeout(drawCanvasFrame, config.frameInterval);
            }
            return;
        }

        html2canvas(htmlElement, {
            grabMouse: typeof config.showMousePointer === 'undefined' || config.showMousePointer,
            onrendered: function(canvas) {
                var duration = new Date().getTime() - lastTime;
                if (!duration) {
                    return setTimeout(drawCanvasFrame, config.frameInterval);
                }

                // via #206, by Jack i.e. @Seymourr
                lastTime = new Date().getTime();

                whammy.frames.push({
                    image: canvas.toDataURL('image/webp', 1),
                    duration: duration
                });

                if (isRecording) {
                    setTimeout(drawCanvasFrame, config.frameInterval);
                }
            }
        });
    }

    var lastTime = new Date().getTime();

    var whammy = new Whammy.Video(100);
}

if (typeof RecordRTC !== 'undefined') {
    RecordRTC.CanvasRecorder = CanvasRecorder;
}

// _________________
// WhammyRecorder.js

/**
 * WhammyRecorder is a standalone class used by {@link RecordRTC} to bring video recording in Chrome. It runs top over {@link Whammy}.
 * @summary Video recording feature in Chrome.
 * @license {@link https://github.com/muaz-khan/RecordRTC#license|MIT}
 * @author {@link http://www.MuazKhan.com|Muaz Khan}
 * @typedef WhammyRecorder
 * @class
 * @example
 * var recorder = new WhammyRecorder(mediaStream);
 * recorder.record();
 * recorder.stop(function(blob) {
 *     video.src = URL.createObjectURL(blob);
 * });
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 * @param {MediaStream} mediaStream - MediaStream object fetched using getUserMedia API or generated using captureStreamUntilEnded or WebAudio API.
 * @param {object} config - {disableLogs: true, initCallback: function, video: HTMLVideoElement, etc.}
 */

function WhammyRecorder(mediaStream, config) {

    config = config || {};

    if (!config.frameInterval) {
        config.frameInterval = 10;
    }

    if (!config.disableLogs) {
        console.log('Using frames-interval:', config.frameInterval);
    }

    /**
     * This method records video.
     * @method
     * @memberof WhammyRecorder
     * @example
     * recorder.record();
     */
    this.record = function() {
        if (!config.width) {
            config.width = 320;
        }

        if (!config.height) {
            config.height = 240;
        }

        if (!config.video) {
            config.video = {
                width: config.width,
                height: config.height
            };
        }

        if (!config.canvas) {
            config.canvas = {
                width: config.width,
                height: config.height
            };
        }

        canvas.width = config.canvas.width;
        canvas.height = config.canvas.height;

        context = canvas.getContext('2d');

        // setting defaults
        if (config.video && config.video instanceof HTMLVideoElement) {
            video = config.video.cloneNode();

            if (config.initCallback) {
                config.initCallback();
            }
        } else {
            video = document.createElement('video');

            if (typeof video.srcObject !== 'undefined') {
                video.srcObject = mediaStream;
            } else {
                video.src = URL.createObjectURL(mediaStream);
            }

            video.onloadedmetadata = function() { // "onloadedmetadata" may NOT work in FF?
                if (config.initCallback) {
                    config.initCallback();
                }
            };

            video.width = config.video.width;
            video.height = config.video.height;
        }

        video.muted = true;
        video.play();

        lastTime = new Date().getTime();
        whammy = new Whammy.Video();

        if (!config.disableLogs) {
            console.log('canvas resolutions', canvas.width, '*', canvas.height);
            console.log('video width/height', video.width || canvas.width, '*', video.height || canvas.height);
        }

        drawFrames(config.frameInterval);
    };

    /**
     * Draw and push frames to Whammy
     * @param {integer} frameInterval - set minimum interval (in milliseconds) between each time we push a frame to Whammy
     */
    function drawFrames(frameInterval) {
        frameInterval = typeof frameInterval !== 'undefined' ? frameInterval : 10;

        var duration = new Date().getTime() - lastTime;
        if (!duration) {
            return setTimeout(drawFrames, frameInterval, frameInterval);
        }

        if (isPausedRecording) {
            lastTime = new Date().getTime();
            return setTimeout(drawFrames, 100);
        }

        // via #206, by Jack i.e. @Seymourr
        lastTime = new Date().getTime();

        if (video.paused) {
            // via: https://github.com/muaz-khan/WebRTC-Experiment/pull/316
            // Tweak for Android Chrome
            video.play();
        }

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        whammy.frames.push({
            duration: duration,
            image: canvas.toDataURL('image/webp')
        });

        if (!isStopDrawing) {
            setTimeout(drawFrames, frameInterval, frameInterval);
        }
    }

    function asyncLoop(o) {
        var i = -1,
            length = o.length;

        var loop = function() {
            i++;
            if (i === length) {
                o.callback();
                return;
            }
            o.functionToLoop(loop, i);
        };
        loop(); //init
    }


    /**
     * remove black frames from the beginning to the specified frame
     * @param {Array} _frames - array of frames to be checked
     * @param {number} _framesToCheck - number of frame until check will be executed (-1 - will drop all frames until frame not matched will be found)
     * @param {number} _pixTolerance - 0 - very strict (only black pixel color) ; 1 - all
     * @param {number} _frameTolerance - 0 - very strict (only black frame color) ; 1 - all
     * @returns {Array} - array of frames
     */
    // pull#293 by @volodalexey
    function dropBlackFrames(_frames, _framesToCheck, _pixTolerance, _frameTolerance, callback) {
        var localCanvas = document.createElement('canvas');
        localCanvas.width = canvas.width;
        localCanvas.height = canvas.height;
        var context2d = localCanvas.getContext('2d');
        var resultFrames = [];

        var checkUntilNotBlack = _framesToCheck === -1;
        var endCheckFrame = (_framesToCheck && _framesToCheck > 0 && _framesToCheck <= _frames.length) ?
            _framesToCheck : _frames.length;
        var sampleColor = {
            r: 0,
            g: 0,
            b: 0
        };
        var maxColorDifference = Math.sqrt(
            Math.pow(255, 2) +
            Math.pow(255, 2) +
            Math.pow(255, 2)
        );
        var pixTolerance = _pixTolerance && _pixTolerance >= 0 && _pixTolerance <= 1 ? _pixTolerance : 0;
        var frameTolerance = _frameTolerance && _frameTolerance >= 0 && _frameTolerance <= 1 ? _frameTolerance : 0;
        var doNotCheckNext = false;

        asyncLoop({
            length: endCheckFrame,
            functionToLoop: function(loop, f) {
                var matchPixCount, endPixCheck, maxPixCount;

                var finishImage = function() {
                    if (!doNotCheckNext && maxPixCount - matchPixCount <= maxPixCount * frameTolerance) {
                        // console.log('removed black frame : ' + f + ' ; frame duration ' + _frames[f].duration);
                    } else {
                        // console.log('frame is passed : ' + f);
                        if (checkUntilNotBlack) {
                            doNotCheckNext = true;
                        }
                        resultFrames.push(_frames[f]);
                    }
                    loop();
                };

                if (!doNotCheckNext) {
                    var image = new Image();
                    image.onload = function() {
                        context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
                        var imageData = context2d.getImageData(0, 0, canvas.width, canvas.height);
                        matchPixCount = 0;
                        endPixCheck = imageData.data.length;
                        maxPixCount = imageData.data.length / 4;

                        for (var pix = 0; pix < endPixCheck; pix += 4) {
                            var currentColor = {
                                r: imageData.data[pix],
                                g: imageData.data[pix + 1],
                                b: imageData.data[pix + 2]
                            };
                            var colorDifference = Math.sqrt(
                                Math.pow(currentColor.r - sampleColor.r, 2) +
                                Math.pow(currentColor.g - sampleColor.g, 2) +
                                Math.pow(currentColor.b - sampleColor.b, 2)
                            );
                            // difference in color it is difference in color vectors (r1,g1,b1) <=> (r2,g2,b2)
                            if (colorDifference <= maxColorDifference * pixTolerance) {
                                matchPixCount++;
                            }
                        }
                        finishImage();
                    };
                    image.src = _frames[f].image;
                } else {
                    finishImage();
                }
            },
            callback: function() {
                resultFrames = resultFrames.concat(_frames.slice(endCheckFrame));

                if (resultFrames.length <= 0) {
                    // at least one last frame should be available for next manipulation
                    // if total duration of all frames will be < 1000 than ffmpeg doesn't work well...
                    resultFrames.push(_frames[_frames.length - 1]);
                }
                callback(resultFrames);
            }
        });
    }

    var isStopDrawing = false;

    /**
     * This method stops recording video.
     * @param {function} callback - Callback function, that is used to pass recorded blob back to the callee.
     * @method
     * @memberof WhammyRecorder
     * @example
     * recorder.stop(function(blob) {
     *     video.src = URL.createObjectURL(blob);
     * });
     */
    this.stop = function(callback) {
        isStopDrawing = true;

        var _this = this;
        // analyse of all frames takes some time!
        setTimeout(function() {
            // e.g. dropBlackFrames(frames, 10, 1, 1) - will cut all 10 frames
            // e.g. dropBlackFrames(frames, 10, 0.5, 0.5) - will analyse 10 frames
            // e.g. dropBlackFrames(frames, 10) === dropBlackFrames(frames, 10, 0, 0) - will analyse 10 frames with strict black color
            dropBlackFrames(whammy.frames, -1, null, null, function(frames) {
                whammy.frames = frames;

                // to display advertisement images!
                if (config.advertisement && config.advertisement.length) {
                    whammy.frames = config.advertisement.concat(whammy.frames);
                }

                /**
                 * @property {Blob} blob - Recorded frames in video/webm blob.
                 * @memberof WhammyRecorder
                 * @example
                 * recorder.stop(function() {
                 *     var blob = recorder.blob;
                 * });
                 */
                whammy.compile(function(blob) {
                    _this.blob = blob;

                    if (_this.blob.forEach) {
                        _this.blob = new Blob([], {
                            type: 'video/webm'
                        });
                    }

                    if (callback) {
                        callback(_this.blob);
                    }
                });
            });
        }, 10);
    };

    var isPausedRecording = false;

    /**
     * This method pauses the recording process.
     * @method
     * @memberof WhammyRecorder
     * @example
     * recorder.pause();
     */
    this.pause = function() {
        isPausedRecording = true;
    };

    /**
     * This method resumes the recording process.
     * @method
     * @memberof WhammyRecorder
     * @example
     * recorder.resume();
     */
    this.resume = function() {
        isPausedRecording = false;

        if (isStopDrawing) {
            this.record();
        }
    };

    /**
     * This method resets currently recorded data.
     * @method
     * @memberof WhammyRecorder
     * @example
     * recorder.clearRecordedData();
     */
    this.clearRecordedData = function() {
        this.pause();
        whammy.frames = [];
    };

    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');

    var video;
    var lastTime;
    var whammy;
}

if (typeof RecordRTC !== 'undefined') {
    RecordRTC.WhammyRecorder = WhammyRecorder;
}

// https://github.com/antimatter15/whammy/blob/master/LICENSE
// _________
// Whammy.js

// todo: Firefox now supports webp for webm containers!
// their MediaRecorder implementation works well!
// should we provide an option to record via Whammy.js or MediaRecorder API is a better solution?

/**
 * Whammy is a standalone class used by {@link RecordRTC} to bring video recording in Chrome. It is written by {@link https://github.com/antimatter15|antimatter15}
 * @summary A real time javascript webm encoder based on a canvas hack.
 * @license {@link https://github.com/muaz-khan/RecordRTC#license|MIT}
 * @author {@link http://www.MuazKhan.com|Muaz Khan}
 * @typedef Whammy
 * @class
 * @example
 * var recorder = new Whammy().Video(15);
 * recorder.add(context || canvas || dataURL);
 * var output = recorder.compile();
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 */

var Whammy = (function() {
    // a more abstract-ish API

    function WhammyVideo(duration) {
        this.frames = [];
        this.duration = duration || 1;
        this.quality = 0.8;
    }

    /**
     * Pass Canvas or Context or image/webp(string) to {@link Whammy} encoder.
     * @method
     * @memberof Whammy
     * @example
     * recorder = new Whammy().Video(0.8, 100);
     * recorder.add(canvas || context || 'image/webp');
     * @param {string} frame - Canvas || Context || image/webp
     * @param {number} duration - Stick a duration (in milliseconds)
     */
    WhammyVideo.prototype.add = function(frame, duration) {
        if ('canvas' in frame) { //CanvasRenderingContext2D
            frame = frame.canvas;
        }

        if ('toDataURL' in frame) {
            frame = frame.toDataURL('image/webp', this.quality);
        }

        if (!(/^data:image\/webp;base64,/ig).test(frame)) {
            throw 'Input must be formatted properly as a base64 encoded DataURI of type image/webp';
        }
        this.frames.push({
            image: frame,
            duration: duration || this.duration
        });
    };

    function processInWebWorker(_function) {
        var blob = URL.createObjectURL(new Blob([_function.toString(),
            'this.onmessage =  function (e) {' + _function.name + '(e.data);}'
        ], {
            type: 'application/javascript'
        }));

        var worker = new Worker(blob);
        URL.revokeObjectURL(blob);
        return worker;
    }

    function whammyInWebWorker(frames) {
        function ArrayToWebM(frames) {
            var info = checkFrames(frames);
            if (!info) {
                return [];
            }

            var clusterMaxDuration = 30000;

            var EBML = [{
                'id': 0x1a45dfa3, // EBML
                'data': [{
                    'data': 1,
                    'id': 0x4286 // EBMLVersion
                }, {
                    'data': 1,
                    'id': 0x42f7 // EBMLReadVersion
                }, {
                    'data': 4,
                    'id': 0x42f2 // EBMLMaxIDLength
                }, {
                    'data': 8,
                    'id': 0x42f3 // EBMLMaxSizeLength
                }, {
                    'data': 'webm',
                    'id': 0x4282 // DocType
                }, {
                    'data': 2,
                    'id': 0x4287 // DocTypeVersion
                }, {
                    'data': 2,
                    'id': 0x4285 // DocTypeReadVersion
                }]
            }, {
                'id': 0x18538067, // Segment
                'data': [{
                    'id': 0x1549a966, // Info
                    'data': [{
                        'data': 1e6, //do things in millisecs (num of nanosecs for duration scale)
                        'id': 0x2ad7b1 // TimecodeScale
                    }, {
                        'data': 'whammy',
                        'id': 0x4d80 // MuxingApp
                    }, {
                        'data': 'whammy',
                        'id': 0x5741 // WritingApp
                    }, {
                        'data': doubleToString(info.duration),
                        'id': 0x4489 // Duration
                    }]
                }, {
                    'id': 0x1654ae6b, // Tracks
                    'data': [{
                        'id': 0xae, // TrackEntry
                        'data': [{
                            'data': 1,
                            'id': 0xd7 // TrackNumber
                        }, {
                            'data': 1,
                            'id': 0x73c5 // TrackUID
                        }, {
                            'data': 0,
                            'id': 0x9c // FlagLacing
                        }, {
                            'data': 'und',
                            'id': 0x22b59c // Language
                        }, {
                            'data': 'V_VP8',
                            'id': 0x86 // CodecID
                        }, {
                            'data': 'VP8',
                            'id': 0x258688 // CodecName
                        }, {
                            'data': 1,
                            'id': 0x83 // TrackType
                        }, {
                            'id': 0xe0, // Video
                            'data': [{
                                'data': info.width,
                                'id': 0xb0 // PixelWidth
                            }, {
                                'data': info.height,
                                'id': 0xba // PixelHeight
                            }]
                        }]
                    }]
                }]
            }];

            //Generate clusters (max duration)
            var frameNumber = 0;
            var clusterTimecode = 0;
            while (frameNumber < frames.length) {

                var clusterFrames = [];
                var clusterDuration = 0;
                do {
                    clusterFrames.push(frames[frameNumber]);
                    clusterDuration += frames[frameNumber].duration;
                    frameNumber++;
                } while (frameNumber < frames.length && clusterDuration < clusterMaxDuration);

                var clusterCounter = 0;
                var cluster = {
                    'id': 0x1f43b675, // Cluster
                    'data': getClusterData(clusterTimecode, clusterCounter, clusterFrames)
                }; //Add cluster to segment
                EBML[1].data.push(cluster);
                clusterTimecode += clusterDuration;
            }

            return generateEBML(EBML);
        }

        function getClusterData(clusterTimecode, clusterCounter, clusterFrames) {
            return [{
                'data': clusterTimecode,
                'id': 0xe7 // Timecode
            }].concat(clusterFrames.map(function(webp) {
                var block = makeSimpleBlock({
                    discardable: 0,
                    frame: webp.data.slice(4),
                    invisible: 0,
                    keyframe: 1,
                    lacing: 0,
                    trackNum: 1,
                    timecode: Math.round(clusterCounter)
                });
                clusterCounter += webp.duration;
                return {
                    data: block,
                    id: 0xa3
                };
            }));
        }

        // sums the lengths of all the frames and gets the duration

        function checkFrames(frames) {
            if (!frames[0]) {
                postMessage({
                    error: 'Something went wrong. Maybe WebP format is not supported in the current browser.'
                });
                return;
            }

            var width = frames[0].width,
                height = frames[0].height,
                duration = frames[0].duration;

            for (var i = 1; i < frames.length; i++) {
                duration += frames[i].duration;
            }
            return {
                duration: duration,
                width: width,
                height: height
            };
        }

        function numToBuffer(num) {
            var parts = [];
            while (num > 0) {
                parts.push(num & 0xff);
                num = num >> 8;
            }
            return new Uint8Array(parts.reverse());
        }

        function strToBuffer(str) {
            return new Uint8Array(str.split('').map(function(e) {
                return e.charCodeAt(0);
            }));
        }

        function bitsToBuffer(bits) {
            var data = [];
            var pad = (bits.length % 8) ? (new Array(1 + 8 - (bits.length % 8))).join('0') : '';
            bits = pad + bits;
            for (var i = 0; i < bits.length; i += 8) {
                data.push(parseInt(bits.substr(i, 8), 2));
            }
            return new Uint8Array(data);
        }

        function generateEBML(json) {
            var ebml = [];
            for (var i = 0; i < json.length; i++) {
                var data = json[i].data;

                if (typeof data === 'object') {
                    data = generateEBML(data);
                }

                if (typeof data === 'number') {
                    data = bitsToBuffer(data.toString(2));
                }

                if (typeof data === 'string') {
                    data = strToBuffer(data);
                }

                var len = data.size || data.byteLength || data.length;
                var zeroes = Math.ceil(Math.ceil(Math.log(len) / Math.log(2)) / 8);
                var sizeToString = len.toString(2);
                var padded = (new Array((zeroes * 7 + 7 + 1) - sizeToString.length)).join('0') + sizeToString;
                var size = (new Array(zeroes)).join('0') + '1' + padded;

                ebml.push(numToBuffer(json[i].id));
                ebml.push(bitsToBuffer(size));
                ebml.push(data);
            }

            return new Blob(ebml, {
                type: 'video/webm'
            });
        }

        function toBinStrOld(bits) {
            var data = '';
            var pad = (bits.length % 8) ? (new Array(1 + 8 - (bits.length % 8))).join('0') : '';
            bits = pad + bits;
            for (var i = 0; i < bits.length; i += 8) {
                data += String.fromCharCode(parseInt(bits.substr(i, 8), 2));
            }
            return data;
        }

        function makeSimpleBlock(data) {
            var flags = 0;

            if (data.keyframe) {
                flags |= 128;
            }

            if (data.invisible) {
                flags |= 8;
            }

            if (data.lacing) {
                flags |= (data.lacing << 1);
            }

            if (data.discardable) {
                flags |= 1;
            }

            if (data.trackNum > 127) {
                throw 'TrackNumber > 127 not supported';
            }

            var out = [data.trackNum | 0x80, data.timecode >> 8, data.timecode & 0xff, flags].map(function(e) {
                return String.fromCharCode(e);
            }).join('') + data.frame;

            return out;
        }

        function parseWebP(riff) {
            var VP8 = riff.RIFF[0].WEBP[0];

            var frameStart = VP8.indexOf('\x9d\x01\x2a'); // A VP8 keyframe starts with the 0x9d012a header
            for (var i = 0, c = []; i < 4; i++) {
                c[i] = VP8.charCodeAt(frameStart + 3 + i);
            }

            var width, height, tmp;

            //the code below is literally copied verbatim from the bitstream spec
            tmp = (c[1] << 8) | c[0];
            width = tmp & 0x3FFF;
            tmp = (c[3] << 8) | c[2];
            height = tmp & 0x3FFF;
            return {
                width: width,
                height: height,
                data: VP8,
                riff: riff
            };
        }

        function getStrLength(string, offset) {
            return parseInt(string.substr(offset + 4, 4).split('').map(function(i) {
                var unpadded = i.charCodeAt(0).toString(2);
                return (new Array(8 - unpadded.length + 1)).join('0') + unpadded;
            }).join(''), 2);
        }

        function parseRIFF(string) {
            var offset = 0;
            var chunks = {};

            while (offset < string.length) {
                var id = string.substr(offset, 4);
                var len = getStrLength(string, offset);
                var data = string.substr(offset + 4 + 4, len);
                offset += 4 + 4 + len;
                chunks[id] = chunks[id] || [];

                if (id === 'RIFF' || id === 'LIST') {
                    chunks[id].push(parseRIFF(data));
                } else {
                    chunks[id].push(data);
                }
            }
            return chunks;
        }

        function doubleToString(num) {
            return [].slice.call(
                new Uint8Array((new Float64Array([num])).buffer), 0).map(function(e) {
                return String.fromCharCode(e);
            }).reverse().join('');
        }

        var webm = new ArrayToWebM(frames.map(function(frame) {
            var webp = parseWebP(parseRIFF(atob(frame.image.slice(23))));
            webp.duration = frame.duration;
            return webp;
        }));

        postMessage(webm);
    }

    /**
     * Encodes frames in WebM container. It uses WebWorkinvoke to invoke 'ArrayToWebM' method.
     * @param {function} callback - Callback function, that is used to pass recorded blob back to the callee.
     * @method
     * @memberof Whammy
     * @example
     * recorder = new Whammy().Video(0.8, 100);
     * recorder.compile(function(blob) {
     *    // blob.size - blob.type
     * });
     */
    WhammyVideo.prototype.compile = function(callback) {
        var webWorker = processInWebWorker(whammyInWebWorker);

        webWorker.onmessage = function(event) {
            if (event.data.error) {
                console.error(event.data.error);
                return;
            }
            callback(event.data);
        };

        webWorker.postMessage(this.frames);
    };

    return {
        /**
         * A more abstract-ish API.
         * @method
         * @memberof Whammy
         * @example
         * recorder = new Whammy().Video(0.8, 100);
         * @param {?number} speed - 0.8
         * @param {?number} quality - 100
         */
        Video: WhammyVideo
    };
})();

if (typeof RecordRTC !== 'undefined') {
    RecordRTC.Whammy = Whammy;
}

// ______________ (indexed-db)
// DiskStorage.js

/**
 * DiskStorage is a standalone object used by {@link RecordRTC} to store recorded blobs in IndexedDB storage.
 * @summary Writing blobs into IndexedDB.
 * @license {@link https://github.com/muaz-khan/RecordRTC#license|MIT}
 * @author {@link http://www.MuazKhan.com|Muaz Khan}
 * @example
 * DiskStorage.Store({
 *     audioBlob: yourAudioBlob,
 *     videoBlob: yourVideoBlob,
 *     gifBlob  : yourGifBlob
 * });
 * DiskStorage.Fetch(function(dataURL, type) {
 *     if(type === 'audioBlob') { }
 *     if(type === 'videoBlob') { }
 *     if(type === 'gifBlob')   { }
 * });
 * // DiskStorage.dataStoreName = 'recordRTC';
 * // DiskStorage.onError = function(error) { };
 * @property {function} init - This method must be called once to initialize IndexedDB ObjectStore. Though, it is auto-used internally.
 * @property {function} Fetch - This method fetches stored blobs from IndexedDB.
 * @property {function} Store - This method stores blobs in IndexedDB.
 * @property {function} onError - This function is invoked for any known/unknown error.
 * @property {string} dataStoreName - Name of the ObjectStore created in IndexedDB storage.
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 */


var DiskStorage = {
    /**
     * This method must be called once to initialize IndexedDB ObjectStore. Though, it is auto-used internally.
     * @method
     * @memberof DiskStorage
     * @internal
     * @example
     * DiskStorage.init();
     */
    init: function() {
        var self = this;

        if (typeof indexedDB === 'undefined' || typeof indexedDB.open === 'undefined') {
            console.error('IndexedDB API are not available in this browser.');
            return;
        }

        var dbVersion = 1;
        var dbName = this.dbName || location.href.replace(/\/|:|#|%|\.|\[|\]/g, ''),
            db;
        var request = indexedDB.open(dbName, dbVersion);

        function createObjectStore(dataBase) {
            dataBase.createObjectStore(self.dataStoreName);
        }

        function putInDB() {
            var transaction = db.transaction([self.dataStoreName], 'readwrite');

            if (self.videoBlob) {
                transaction.objectStore(self.dataStoreName).put(self.videoBlob, 'videoBlob');
            }

            if (self.gifBlob) {
                transaction.objectStore(self.dataStoreName).put(self.gifBlob, 'gifBlob');
            }

            if (self.audioBlob) {
                transaction.objectStore(self.dataStoreName).put(self.audioBlob, 'audioBlob');
            }

            function getFromStore(portionName) {
                transaction.objectStore(self.dataStoreName).get(portionName).onsuccess = function(event) {
                    if (self.callback) {
                        self.callback(event.target.result, portionName);
                    }
                };
            }

            getFromStore('audioBlob');
            getFromStore('videoBlob');
            getFromStore('gifBlob');
        }

        request.onerror = self.onError;

        request.onsuccess = function() {
            db = request.result;
            db.onerror = self.onError;

            if (db.setVersion) {
                if (db.version !== dbVersion) {
                    var setVersion = db.setVersion(dbVersion);
                    setVersion.onsuccess = function() {
                        createObjectStore(db);
                        putInDB();
                    };
                } else {
                    putInDB();
                }
            } else {
                putInDB();
            }
        };
        request.onupgradeneeded = function(event) {
            createObjectStore(event.target.result);
        };
    },
    /**
     * This method fetches stored blobs from IndexedDB.
     * @method
     * @memberof DiskStorage
     * @internal
     * @example
     * DiskStorage.Fetch(function(dataURL, type) {
     *     if(type === 'audioBlob') { }
     *     if(type === 'videoBlob') { }
     *     if(type === 'gifBlob')   { }
     * });
     */
    Fetch: function(callback) {
        this.callback = callback;
        this.init();

        return this;
    },
    /**
     * This method stores blobs in IndexedDB.
     * @method
     * @memberof DiskStorage
     * @internal
     * @example
     * DiskStorage.Store({
     *     audioBlob: yourAudioBlob,
     *     videoBlob: yourVideoBlob,
     *     gifBlob  : yourGifBlob
     * });
     */
    Store: function(config) {
        this.audioBlob = config.audioBlob;
        this.videoBlob = config.videoBlob;
        this.gifBlob = config.gifBlob;

        this.init();

        return this;
    },
    /**
     * This function is invoked for any known/unknown error.
     * @method
     * @memberof DiskStorage
     * @internal
     * @example
     * DiskStorage.onError = function(error){
     *     alerot( JSON.stringify(error) );
     * };
     */
    onError: function(error) {
        console.error(JSON.stringify(error, null, '\t'));
    },

    /**
     * @property {string} dataStoreName - Name of the ObjectStore created in IndexedDB storage.
     * @memberof DiskStorage
     * @internal
     * @example
     * DiskStorage.dataStoreName = 'recordRTC';
     */
    dataStoreName: 'recordRTC',
    dbName: null
};

if (typeof RecordRTC !== 'undefined') {
    RecordRTC.DiskStorage = DiskStorage;
}

// ______________
// GifRecorder.js

/**
 * GifRecorder is standalone calss used by {@link RecordRTC} to record video or canvas into animated gif.
 * @license {@link https://github.com/muaz-khan/RecordRTC#license|MIT}
 * @author {@link http://www.MuazKhan.com|Muaz Khan}
 * @typedef GifRecorder
 * @class
 * @example
 * var recorder = new GifRecorder(mediaStream || canvas || context, { width: 1280, height: 720, frameRate: 200, quality: 10 });
 * recorder.record();
 * recorder.stop(function(blob) {
 *     img.src = URL.createObjectURL(blob);
 * });
 * @see {@link https://github.com/muaz-khan/RecordRTC|RecordRTC Source Code}
 * @param {MediaStream} mediaStream - MediaStream object or HTMLCanvasElement or CanvasRenderingContext2D.
 * @param {object} config - {disableLogs:true, initCallback: function, width: 320, height: 240, frameRate: 200, quality: 10}
 */

function GifRecorder(mediaStream, config) {
    if (typeof GIFEncoder === 'undefined') {
        throw 'Please link: https://cdn.webrtc-experiment.com/gif-recorder.js';
    }

    config = config || {};

    var isHTMLObject = mediaStream instanceof CanvasRenderingContext2D || mediaStream instanceof HTMLCanvasElement;

    /**
     * This method records MediaStream.
     * @method
     * @memberof GifRecorder
     * @example
     * recorder.record();
     */
    this.record = function() {
        if (!isHTMLObject) {
            if (!config.width) {
                config.width = video.offsetWidth || 320;
            }

            if (!this.height) {
                config.height = video.offsetHeight || 240;
            }

            if (!config.video) {
                config.video = {
                    width: config.width,
                    height: config.height
                };
            }

            if (!config.canvas) {
                config.canvas = {
                    width: config.width,
                    height: config.height
                };
            }

            canvas.width = config.canvas.width;
            canvas.height = config.canvas.height;

            video.width = config.video.width;
            video.height = config.video.height;
        }

        // external library to record as GIF images
        gifEncoder = new GIFEncoder();

        // void setRepeat(int iter) 
        // Sets the number of times the set of GIF frames should be played. 
        // Default is 1; 0 means play indefinitely.
        gifEncoder.setRepeat(0);

        // void setFrameRate(Number fps) 
        // Sets frame rate in frames per second. 
        // Equivalent to setDelay(1000/fps).
        // Using "setDelay" instead of "setFrameRate"
        gifEncoder.setDelay(config.frameRate || 200);

        // void setQuality(int quality) 
        // Sets quality of color quantization (conversion of images to the 
        // maximum 256 colors allowed by the GIF specification). 
        // Lower values (minimum = 1) produce better colors, 
        // but slow processing significantly. 10 is the default, 
        // and produces good color mapping at reasonable speeds. 
        // Values greater than 20 do not yield significant improvements in speed.
        gifEncoder.setQuality(config.quality || 10);

        // Boolean start() 
        // This writes the GIF Header and returns false if it fails.
        gifEncoder.start();

        startTime = Date.now();

        var self = this;

        function drawVideoFrame(time) {
            if (isPausedRecording) {
                return setTimeout(function() {
                    drawVideoFrame(time);
                }, 100);
            }

            lastAnimationFrame = requestAnimationFrame(drawVideoFrame);

            if (typeof lastFrameTime === undefined) {
                lastFrameTime = time;
            }

            // ~10 fps
            if (time - lastFrameTime < 90) {
                return;
            }

            if (!isHTMLObject && video.paused) {
                // via: https://github.com/muaz-khan/WebRTC-Experiment/pull/316
                // Tweak for Android Chrome
                video.play();
            }

            if (!isHTMLObject) {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
            }

            if (config.onGifPreview) {
                config.onGifPreview(canvas.toDataURL('image/png'));
            }

            gifEncoder.addFrame(context);
            lastFrameTime = time;
        }

        lastAnimationFrame = requestAnimationFrame(drawVideoFrame);

        if (config.initCallback) {
            config.initCallback();
        }
    };

    /**
     * This method stops recording MediaStream.
     * @param {function} callback - Callback function, that is used to pass recorded blob back to the callee.
     * @method
     * @memberof GifRecorder
     * @example
     * recorder.stop(function(blob) {
     *     img.src = URL.createObjectURL(blob);
     * });
     */
    this.stop = function() {
        if (lastAnimationFrame) {
            cancelAnimationFrame(lastAnimationFrame);
        }

        endTime = Date.now();

        /**
         * @property {Blob} blob - The recorded blob object.
         * @memberof GifRecorder
         * @example
         * recorder.stop(function(){
         *     var blob = recorder.blob;
         * });
         */
        this.blob = new Blob([new Uint8Array(gifEncoder.stream().bin)], {
            type: 'image/gif'
        });

        // bug: find a way to clear old recorded blobs
        gifEncoder.stream().bin = [];
    };

    var isPausedRecording = false;

    /**
     * This method pauses the recording process.
     * @method
     * @memberof GifRecorder
     * @example
     * recorder.pause();
     */
    this.pause = function() {
        isPausedRecording = true;
    };

    /**
     * This method resumes the recording process.
     * @method
     * @memberof GifRecorder
     * @example
     * recorder.resume();
     */
    this.resume = function() {
        isPausedRecording = false;
    };

    /**
     * This method resets currently recorded data.
     * @method
     * @memberof GifRecorder
     * @example
     * recorder.clearRecordedData();
     */
    this.clearRecordedData = function() {
        if (!gifEncoder) {
            return;
        }

        this.pause();

        gifEncoder.stream().bin = [];
    };

    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');

    if (isHTMLObject) {
        if (mediaStream instanceof CanvasRenderingContext2D) {
            context = mediaStream;
            canvas = context.canvas;
        } else if (mediaStream instanceof HTMLCanvasElement) {
            context = mediaStream.getContext('2d');
            canvas = mediaStream;
        }
    }

    if (!isHTMLObject) {
        var video = document.createElement('video');
        video.muted = true;
        video.autoplay = true;

        if (typeof video.srcObject !== 'undefined') {
            video.srcObject = mediaStream;
        } else {
            video.src = URL.createObjectURL(mediaStream);
        }

        video.play();
    }

    var lastAnimationFrame = null;
    var startTime, endTime, lastFrameTime;

    var gifEncoder;
}

if (typeof RecordRTC !== 'undefined') {
    RecordRTC.GifRecorder = GifRecorder;
}
/*
	* SoundTouch JS audio processing library
* Copyright (c) Olli Parviainen
* Copyright (c) Ryan Berdeen
*
* This library is free software; you can redistribute it and/or
* modify it under the terms of the GNU Lesser General Public
* License as published by the Free Software Foundation; either
* version 2.1 of the License, or (at your option) any later version.
*
* This library is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
* Lesser General License for more details.
*
* You should have received a copy of the GNU Lesser General Public
* License along with this library; if not, write to the Free Software
* Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
*/


function extend(a,b) {
	var contextClass = (window.AudioContext ||
	  window.webkitAudioContext ||
	  window.mozAudioContext ||
	  window.oAudioContext ||
	  window.msAudioContext);
	if(!contextClass) return a;
    for ( var i in b ) {
        var g = b.__lookupGetter__(i), 
			s = b.__lookupSetter__(i);

        if ( g || s ) {
            if ( g )
                a.__defineGetter__(i, g);
            if ( s )
                a.__defineSetter__(i, s);
         } else
             a[i] = b[i];
    }
    return a;
}

function testFloatEqual(a, b) {
    return (a > b ? a - b : b - a) > 1e-10;
}

/////////////

function AbstractFifoSamplePipe(createBuffers) {
    if (createBuffers) {
        this.inputBuffer = new FifoSampleBuffer();
        this.outputBuffer = new FifoSampleBuffer();
    }
    else {
        this.inputBuffer = this.outputBuffer = null;
    }
}

AbstractFifoSamplePipe.prototype = {
    get inputBuffer() {
        return this._inputBuffer;
    },

    set inputBuffer (inputBuffer) {
      this._inputBuffer = inputBuffer;
    },

    get outputBuffer() {
        return this._outputBuffer;
    },

    set outputBuffer(outputBuffer) {
      this._outputBuffer = outputBuffer;
    },

    clear: function () {
        this._inputBuffer.clear();
        this._outputBuffer.clear();
    }
};

/////////////////

function RateTransposer(createBuffers) {
    AbstractFifoSamplePipe.call(this, createBuffers);
    this._reset();
    this.rate = 1;
}

extend(RateTransposer.prototype, AbstractFifoSamplePipe.prototype);
extend(RateTransposer.prototype, {
    set rate(rate) {
        this._rate = rate;
        // TODO aa filter
    },

    _reset: function () {
        this.slopeCount = 0;
        this.prevSampleL = 0;
        this.prevSampleR = 0;
    },

    clone: function () {
        var result = new RateTransposer();
        result.rate = this._rate;
        return result;
    },

    process: function () {
        // TODO aa filter
        var numFrames = this._inputBuffer.frameCount;
        this._outputBuffer.ensureAdditionalCapacity(numFrames / this._rate + 1);
        var numFramesOutput = this._transpose(numFrames);
        this._inputBuffer.receive();
        this._outputBuffer.put(numFramesOutput);
    },

    _transpose: function (numFrames) {
        if (numFrames == 0) {
            // no work
            return 0;
        }

        var src = this._inputBuffer.vector;
        var srcOffset = this._inputBuffer.startIndex;

        var dest = this._outputBuffer.vector;
        var destOffset = this._outputBuffer.endIndex;

        var used = 0;
        var i = 0;

        while(this.slopeCount < 1.0) {
            dest[destOffset + 2 * i] = (1.0 - this.slopeCount) * this.prevSampleL + this.slopeCount * src[srcOffset];
            dest[destOffset + 2 * i + 1] = (1.0 - this.slopeCount) * this.prevSampleR + this.slopeCount * src[srcOffset + 1];
            i++;
            this.slopeCount += this._rate;
        }

        this.slopeCount -= 1.0;

        if (numFrames != 1) {
            out: while (true) {
                while (this.slopeCount > 1.0) {
                    this.slopeCount -= 1.0;
                    used++;
                    if (used >= numFrames - 1) {
                        break out;
                    }
                }

                var srcIndex = srcOffset + 2 * used;
                dest[destOffset + 2 * i] = (1.0 - this.slopeCount) * src[srcIndex] + this.slopeCount * src[srcIndex + 2];
                dest[destOffset + 2 * i + 1] = (1.0 - this.slopeCount) * src[srcIndex + 1] + this.slopeCount * src[srcIndex + 3];

                i++;
                this.slopeCount += this._rate;
            }
        }

        this.prevSampleL = src[srcOffset + 2 * numFrames - 2];
        this.prevSampleR = src[srcOffset + 2 * numFrames - 1];

        return i;
    }
});

////////////////////

function FifoSampleBuffer() {
    this._vector = new Float32Array();
    this._position = 0;
    this._frameCount = 0;
}

FifoSampleBuffer.prototype = {
    get vector() {
        return this._vector;
    },

    get position() {
        return this._position;
    },

    get startIndex() {
        return this._position * 2;
    },

    get frameCount() {
        return this._frameCount;
    },

    get endIndex() {
        return (this._position + this._frameCount) * 2;
    },

    clear: function() {
        this.receive(frameCount);
        this.rewind();
    },

    put: function (numFrames) {
        this._frameCount += numFrames;
    },

    putSamples: function (samples, position, numFrames) {
        position = position || 0;
        var sourceOffset = position * 2;
        if (!(numFrames >= 0)) {
            numFrames = (samples.length - sourceOffset) / 2;
        }
        var numSamples = numFrames * 2;

        this.ensureCapacity(numFrames + this._frameCount);

        var destOffset = this.endIndex;
        this._vector.set(samples.subarray(sourceOffset, sourceOffset + numSamples), destOffset);

        this._frameCount += numFrames;
    },

    putBuffer: function (buffer, position, numFrames) {
        position = position || 0;
        if (!(numFrames >= 0)) {
            numFrames = buffer.frameCount - position;
        }
        this.putSamples(buffer.vector, buffer.position + position, numFrames);
    },

    receive: function (numFrames) {
        if (!(numFrames >= 0) || numFrames > this._frameCount) {
            numFrames = this._frameCount
        }
        this._frameCount -= numFrames;
        this._position += numFrames;
    },

    receiveSamples: function (output, numFrames) {
        var numSamples = numFrames * 2;
        var sourceOffset = this.startIndex;
        output.set(this._vector.subarray(sourceOffset, sourceOffset + numSamples));
        this.receive(numFrames);
    },

    extract: function (output, position, numFrames) {
        var sourceOffset = this.startIndex + position * 2;
        var numSamples = numFrames * 2;
        output.set(this._vector.subarray(sourceOffset, sourceOffset + numSamples));
    },

    ensureCapacity: function (numFrames) {
        var minLength = parseInt(numFrames * 2);
        if (this._vector.length < minLength) {
            var newVector = new Float32Array(minLength);
            newVector.set(this._vector.subarray(this.startIndex, this.endIndex));
            this._vector = newVector;
            this._position = 0;
        }
        else {
            this.rewind();
        }
    },

    ensureAdditionalCapacity: function (numFrames) {
        this.ensureCapacity(this.frameCount + numFrames);
    },

    rewind: function () {
        if (this._position > 0) {
            this._vector.set(this._vector.subarray(this.startIndex, this.endIndex));
            this._position = 0;
        }
    }
};

//////////////////

function FilterSupport(pipe) {
    this._pipe = pipe;
}

FilterSupport.prototype = {
    get pipe() {
        return this._pipe;
    },

    get inputBuffer() {
        return this._pipe.inputBuffer;
    },

    get outputBuffer() {
        return this._pipe.outputBuffer;
    },

    // fillInputBuffer: function(numFrames) {
    //     throw new Error("fillInputBuffer() not overridden");
    // },

    fillOutputBuffer: function(numFrames) {
        while (this.outputBuffer.frameCount < numFrames) {
            // TODO hardcoded buffer size
            var numInputFrames = (8192 * 2) - this.inputBuffer.frameCount;

            this.fillInputBuffer(numInputFrames);

            if (this.inputBuffer.frameCount < (8192 * 2)) {
                break;
                // TODO flush pipe
            }
            this._pipe.process();
        }
    },

    clear: function() {
        this._pipe.clear();
    }
};

function SimpleFilter(sourceSound, pipe) {
    FilterSupport.call(this, pipe);
    this.sourceSound = sourceSound;
    this.historyBufferSize = 22050;
    this._sourcePosition = 0;
    this.outputBufferPosition = 0;
    this._position = 0;
}

extend(SimpleFilter.prototype, FilterSupport.prototype);

extend(SimpleFilter.prototype, {
    get position() {
        return this._position;
    },

    set position(position) {
        // if (position > this._position) {
        //     throw new RangeError('New position may not be greater than current position');
        // }
        var newOutputBufferPosition = this.outputBufferPosition - (this._position - position);
        // if (newOutputBufferPosition < 0) {
        //     throw new RangeError('New position falls outside of history buffer');
        // }
        this.outputBufferPosition = newOutputBufferPosition;
        this._position = position;
    },

    get sourcePosition() {
        return this._sourcePosition;
    },

    set sourcePosition(sourcePosition) {
        this.clear();
        this._sourcePosition = sourcePosition;
    },

    fillInputBuffer: function(numFrames) {
        var samples = new Float32Array(numFrames * 2);
        var numFramesExtracted = this.sourceSound.extract(samples, numFrames, this._sourcePosition);
        this._sourcePosition += numFramesExtracted;
        this.inputBuffer.putSamples(samples, 0, numFramesExtracted);
    },

    extract: function(target, numFrames) {
        this.fillOutputBuffer(this.outputBufferPosition + numFrames);

        var numFramesExtracted = Math.min(numFrames, this.outputBuffer.frameCount - this.outputBufferPosition);
        this.outputBuffer.extract(target, this.outputBufferPosition, numFramesExtracted);

        var currentFrames = this.outputBufferPosition + numFramesExtracted;
        this.outputBufferPosition = Math.min(this.historyBufferSize, currentFrames);
        this.outputBuffer.receive(Math.max(currentFrames - this.historyBufferSize, 0));

        this._position += numFramesExtracted;
        return numFramesExtracted;
    },

    handleSampleData: function(e) {
        this.extract(e.data, 4096);
    },

    clear: function() {
        // TODO yuck
        // FilterSupport.prototype.clear.call(this);
        this.outputBufferPosition = 0;
    }
});

//////////

/**
* Giving this value for the sequence length sets automatic parameter value
* according to tempo setting (recommended)
*/
var USE_AUTO_SEQUENCE_LEN = 0;

/**
* Default length of a single processing sequence, in milliseconds. This determines to how
* long sequences the original sound is chopped in the time-stretch algorithm.
*
* The larger this value is, the lesser sequences are used in processing. In principle
* a bigger value sounds better when slowing down tempo, but worse when increasing tempo
* and vice versa.
*
* Increasing this value reduces computational burden and vice versa.
*/
//var DEFAULT_SEQUENCE_MS = 130
var DEFAULT_SEQUENCE_MS = USE_AUTO_SEQUENCE_LEN;

/**
* Giving this value for the seek window length sets automatic parameter value
* according to tempo setting (recommended)
*/
var USE_AUTO_SEEKWINDOW_LEN = 0;

/**
* Seeking window default length in milliseconds for algorithm that finds the best possible
* overlapping location. This determines from how wide window the algorithm may look for an
* optimal joining location when mixing the sound sequences back together.
*
* The bigger this window setting is, the higher the possibility to find a better mixing
* position will become, but at the same time large values may cause a "drifting" artifact
* because consequent sequences will be taken at more uneven intervals.
*
* If there's a disturbing artifact that sounds as if a constant frequency was drifting
* around, try reducing this setting.
*
* Increasing this value increases computational burden and vice versa.
*/
//var DEFAULT_SEEKWINDOW_MS = 25;
var DEFAULT_SEEKWINDOW_MS = USE_AUTO_SEEKWINDOW_LEN;

/**
* Overlap length in milliseconds. When the chopped sound sequences are mixed back together,
* to form a continuous sound stream, this parameter defines over how long period the two
* consecutive sequences are let to overlap each other.
*
* This shouldn't be that critical parameter. If you reduce the DEFAULT_SEQUENCE_MS setting
* by a large amount, you might wish to try a smaller value on this.
*
* Increasing this value increases computational burden and vice versa.
*/
var DEFAULT_OVERLAP_MS = 8;

// Table for the hierarchical mixing position seeking algorithm
var _SCAN_OFFSETS = [
    [ 124,  186,  248,  310,  372,  434,  496,  558,  620,  682,  744, 806,
      868,  930,  992, 1054, 1116, 1178, 1240, 1302, 1364, 1426, 1488,   0],
    [-100,  -75,  -50,  -25,   25,   50,   75,  100,    0,    0,    0,   0,
        0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,   0],
    [ -20,  -15,  -10,   -5,    5,   10,   15,   20,    0,    0,    0,   0,
        0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,   0],
    [  -4,   -3,   -2,   -1,    1,    2,    3,    4,    0,    0,    0,   0,
        0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,   0]];

// Adjust tempo param according to tempo, so that variating processing sequence length is used
// at varius tempo settings, between the given low...top limits
var AUTOSEQ_TEMPO_LOW = 0.5;     // auto setting low tempo range (-50%)
var AUTOSEQ_TEMPO_TOP = 2.0;     // auto setting top tempo range (+100%)

// sequence-ms setting values at above low & top tempo
var AUTOSEQ_AT_MIN = 125.0;
var AUTOSEQ_AT_MAX = 50.0;
var AUTOSEQ_K = ((AUTOSEQ_AT_MAX - AUTOSEQ_AT_MIN) / (AUTOSEQ_TEMPO_TOP - AUTOSEQ_TEMPO_LOW));
var AUTOSEQ_C = (AUTOSEQ_AT_MIN - (AUTOSEQ_K) * (AUTOSEQ_TEMPO_LOW));

// seek-window-ms setting values at above low & top tempo
var AUTOSEEK_AT_MIN = 25.0;
var AUTOSEEK_AT_MAX = 15.0;
var AUTOSEEK_K = ((AUTOSEEK_AT_MAX - AUTOSEEK_AT_MIN) / (AUTOSEQ_TEMPO_TOP - AUTOSEQ_TEMPO_LOW));
var AUTOSEEK_C = (AUTOSEEK_AT_MIN - (AUTOSEEK_K) * (AUTOSEQ_TEMPO_LOW));

function Stretch(createBuffers) {
    AbstractFifoSamplePipe.call(this, createBuffers);
    this.bQuickSeek = true;
    this.bMidBufferDirty = false;

    this.pMidBuffer = null;
    this.overlapLength = 0;

    this.bAutoSeqSetting = true;
    this.bAutoSeekSetting = true;

    this._tempo = 1;
    this.setParameters(44100, DEFAULT_SEQUENCE_MS, DEFAULT_SEEKWINDOW_MS, DEFAULT_OVERLAP_MS);
}

extend(Stretch.prototype, AbstractFifoSamplePipe.prototype);

extend(Stretch.prototype, {
    clear: function () {
        AbstractFifoSamplePipe.prototype.clear.call(this);
        this._clearMidBuffer();
    },

    _clearMidBuffer: function () {
        if (this.bMidBufferDirty) {
            this.bMidBufferDirty = false;
            this.pMidBuffer = null;
        }
    },

    /**
    * Sets routine control parameters. These control are certain time constants
    * defining how the sound is stretched to the desired duration.
    *
    * 'sampleRate' = sample rate of the sound
    * 'sequenceMS' = one processing sequence length in milliseconds (default = 82 ms)
    * 'seekwindowMS' = seeking window length for scanning the best overlapping
    *      position (default = 28 ms)
    * 'overlapMS' = overlapping length (default = 12 ms)
    */
    setParameters: function(aSampleRate, aSequenceMS, aSeekWindowMS, aOverlapMS) {
        // accept only positive parameter values - if zero or negative, use old values instead
        if (aSampleRate > 0) {
            this.sampleRate = aSampleRate;
        }
        if (aOverlapMS > 0) {
            this.overlapMs = aOverlapMS;
        }

        if (aSequenceMS > 0) {
            this.sequenceMs = aSequenceMS;
            this.bAutoSeqSetting = false;
        } else {
            // zero or below, use automatic setting
            this.bAutoSeqSetting = true;
        }

        if (aSeekWindowMS > 0) {
            this.seekWindowMs = aSeekWindowMS;
            this.bAutoSeekSetting = false;
        } else {
            // zero or below, use automatic setting
            this.bAutoSeekSetting = true;
        }

        this.calcSeqParameters();

        this.calculateOverlapLength(this.overlapMs);

        // set tempo to recalculate 'sampleReq'
        this.tempo = this._tempo;
    },

    /**
    * Sets new target tempo. Normal tempo = 'SCALE', smaller values represent slower
    * tempo, larger faster tempo.
    */
    set tempo(newTempo) {
        var intskip;

        this._tempo = newTempo;

        // Calculate new sequence duration
        this.calcSeqParameters();

        // Calculate ideal skip length (according to tempo value)
        this.nominalSkip = this._tempo * (this.seekWindowLength - this.overlapLength);
        this.skipFract = 0;
        intskip = Math.floor(this.nominalSkip + 0.5);

        // Calculate how many samples are needed in the 'inputBuffer' to
        // process another batch of samples
        this.sampleReq = Math.max(intskip + this.overlapLength, this.seekWindowLength) + this.seekLength;
    },


    // get tempo() {
    //   return this._tempo;
    // },

    get inputChunkSize() {
        return this.sampleReq;
    },

    get outputChunkSize() {
        return this.overlapLength + Math.max(0, this.seekWindowLength - 2 * this.overlapLength);
    },

    /**
    * Calculates overlapInMsec period length in samples.
    */
    calculateOverlapLength: function (overlapInMsec) {
        var newOvl;

        // TODO assert(overlapInMsec >= 0);
        newOvl = (this.sampleRate * overlapInMsec) / 1000;
        if (newOvl < 16) newOvl = 16;

        // must be divisible by 8
        newOvl -= newOvl % 8;

        this.overlapLength = newOvl;

        this.pRefMidBuffer = new Float32Array(this.overlapLength * 2);
        this.pMidBuffer = new Float32Array(this.overlapLength * 2);
    },

    checkLimits: function (x, mi, ma) {
        return (x < mi) ? mi : ((x > ma) ? ma : x);
    },

    /**
    * Calculates processing sequence length according to tempo setting
    */
    calcSeqParameters: function() {
        var seq;
        var seek;

        if (this.bAutoSeqSetting) {
            seq = AUTOSEQ_C + AUTOSEQ_K * this._tempo;
            seq = this.checkLimits(seq, AUTOSEQ_AT_MAX, AUTOSEQ_AT_MIN);
            this.sequenceMs = Math.floor(seq + 0.5);
        }

        if (this.bAutoSeekSetting) {
            seek = AUTOSEEK_C + AUTOSEEK_K * this._tempo;
            seek = this.checkLimits(seek, AUTOSEEK_AT_MAX, AUTOSEEK_AT_MIN);
            this.seekWindowMs = Math.floor(seek + 0.5);
        }

        // Update seek window lengths
        this.seekWindowLength = Math.floor((this.sampleRate * this.sequenceMs) / 1000);
        this.seekLength = Math.floor((this.sampleRate * this.seekWindowMs) / 1000);
    },


    /**
    * Enables/disables the quick position seeking algorithm.
    */
    set quickSeek(enable) {
        this.bQuickSeek = enable;
    },

    clone: function () {
        var result = new Stretch();
        result.tempo = this.tempo;
        result.setParameters(this.sampleRate, this.sequenceMs, this.seekWindowMs, this.overlapMs);
        return result;
    },

    /**
    * Seeks for the optimal overlap-mixing position.
    */
    seekBestOverlapPosition: function () {
      if (this.bQuickSeek) {
          return this.seekBestOverlapPositionStereoQuick();
      }
      else {
          return this.seekBestOverlapPositionStereo();
      }
    },

    /**
    * Seeks for the optimal overlap-mixing position. The 'stereo' version of the
    * routine
    *
    * The best position is determined as the position where the two overlapped
    * sample sequences are 'most alike', in terms of the highest cross-correlation
    * value over the overlapping period
    */
    seekBestOverlapPositionStereo: function () {
        var bestOffs;
        var bestCorr
        var corr;
        var i;

        // Slopes the amplitudes of the 'midBuffer' samples
        this.precalcCorrReferenceStereo();

        bestCorr = Number.MIN_VALUE;
        bestOffs = 0;

        // Scans for the best correlation value by testing each possible position
        // over the permitted range.
        for (i = 0; i < this.seekLength; i ++) {
            // Calculates correlation value for the mixing position corresponding
            // to 'i'
            corr = this.calcCrossCorrStereo(2 * i, this.pRefMidBuffer);

            // Checks for the highest correlation value
            if (corr > bestCorr) {
                bestCorr = corr;
                bestOffs = i;
            }
        }

        return bestOffs;
    },

    /**
    * Seeks for the optimal overlap-mixing position. The 'stereo' version of the
    * routine
    *
    * The best position is determined as the position where the two overlapped
    * sample sequences are 'most alike', in terms of the highest cross-correlation
    * value over the overlapping period
    */
    seekBestOverlapPositionStereoQuick: function () {
        var j;
        var bestOffs;
        var bestCorr;
        var corr;
        var scanCount;
        var corrOffset;
        var tempOffset;

        // Slopes the amplitude of the 'midBuffer' samples
        this.precalcCorrReferenceStereo();

        bestCorr = Number.MIN_VALUE;
        bestOffs = 0;
        corrOffset = 0;
        tempOffset = 0;

        // Scans for the best correlation value using four-pass hierarchical search.
        //
        // The look-up table 'scans' has hierarchical position adjusting steps.
        // In first pass the routine searhes for the highest correlation with
        // relatively coarse steps, then rescans the neighbourhood of the highest
        // correlation with better resolution and so on.
        for (scanCount = 0; scanCount < 4; scanCount ++) {
            j = 0;
            while (_SCAN_OFFSETS[scanCount][j]) {
                tempOffset = corrOffset + _SCAN_OFFSETS[scanCount][j];
                if (tempOffset >= this.seekLength) break;

                // Calculates correlation value for the mixing position corresponding
                // to 'tempOffset'
                corr = this.calcCrossCorrStereo(2 * tempOffset, this.pRefMidBuffer);

                // Checks for the highest correlation value
                if (corr > bestCorr) {
                    bestCorr = corr;
                    bestOffs = tempOffset;
                }
                j++;
            }
            corrOffset = bestOffs;
        }

        return bestOffs;
    },

    /**
    * Slopes the amplitude of the 'midBuffer' samples so that cross correlation
    * is faster to calculate
    */
    precalcCorrReferenceStereo: function() {
        var i;
        var cnt2;
        var temp;

        for (i = 0; i < this.overlapLength; i ++) {
            temp = i * (this.overlapLength - i);
            cnt2 = i * 2;
            this.pRefMidBuffer[cnt2] = this.pMidBuffer[cnt2] * temp;
            this.pRefMidBuffer[cnt2 + 1] = this.pMidBuffer[cnt2 + 1] * temp;
        }
    },

    calcCrossCorrStereo: function(mixingPos, compare) {
        var mixing = this._inputBuffer.vector;
        mixingPos += this._inputBuffer.startIndex;

        var corr;
        var i;
        var mixingOffset;

        corr = 0;
        for (i = 2; i < 2 * this.overlapLength; i += 2) {
            mixingOffset = i + mixingPos;
            corr += mixing[mixingOffset] * compare[i] +
            mixing[mixingOffset + 1] * compare[i + 1];
        }

        return corr;
    },

    // TODO inline
    /**
    * Overlaps samples in 'midBuffer' with the samples in 'pInputBuffer' at position
    * of 'ovlPos'.
    */
    overlap: function (ovlPos) {
        this.overlapStereo(2 * ovlPos);
    },

    /**
    * Overlaps samples in 'midBuffer' with the samples in 'pInput'
    */
    overlapStereo: function(pInputPos) {
        var pInput = this._inputBuffer.vector;
        pInputPos += this._inputBuffer.startIndex;

        var pOutput = this._outputBuffer.vector;
        var pOutputPos = this._outputBuffer.endIndex;

        var i;
        var cnt2;
        var fTemp;
        var fScale;
        var fi;
        var pInputOffset;
        var pOutputOffset;

        fScale = 1 / this.overlapLength;

        for (i = 0; i < this.overlapLength; i++) {
            fTemp = (this.overlapLength - i) * fScale;
            fi = i * fScale;
            cnt2 = 2 * i;
            pInputOffset = cnt2 + pInputPos;
            pOutputOffset = cnt2 + pOutputPos;
            pOutput[pOutputOffset + 0] = pInput[pInputOffset + 0] * fi + this.pMidBuffer[cnt2 + 0] * fTemp;
            pOutput[pOutputOffset + 1] = pInput[pInputOffset + 1] * fi + this.pMidBuffer[cnt2 + 1] * fTemp;
        }
    },

    process: function() {
        var ovlSkip;
        var offset;
        var temp;
        var i;

        if (this.pMidBuffer == null) {
            // if midBuffer is empty, move the first samples of the input stream
            // into it
            if (this._inputBuffer.frameCount < this.overlapLength) {
                // wait until we've got overlapLength samples
                return;
            }
            this.pMidBuffer = new Float32Array(this.overlapLength * 2);
            this._inputBuffer.receiveSamples(this.pMidBuffer, this.overlapLength);
        }

        var output;
        // Process samples as long as there are enough samples in 'inputBuffer'
        // to form a processing frame.
        while (this._inputBuffer.frameCount >= this.sampleReq) {
            // If tempo differs from the normal ('SCALE'), scan for the best overlapping
            // position
            offset = this.seekBestOverlapPosition();

            // Mix the samples in the 'inputBuffer' at position of 'offset' with the
            // samples in 'midBuffer' using sliding overlapping
            // ... first partially overlap with the end of the previous sequence
            // (that's in 'midBuffer')
            this._outputBuffer.ensureAdditionalCapacity(this.overlapLength);
            // FIXME unit?
            //overlap(uint(offset));
            this.overlap(Math.floor(offset));
            this._outputBuffer.put(this.overlapLength);

            // ... then copy sequence samples from 'inputBuffer' to output
            temp = (this.seekWindowLength - 2 * this.overlapLength); // & 0xfffffffe;
            if (temp > 0) {
                this._outputBuffer.putBuffer(this._inputBuffer, offset + this.overlapLength, temp);
            }

            // Copies the end of the current sequence from 'inputBuffer' to
            // 'midBuffer' for being mixed with the beginning of the next
            // processing sequence and so on
            //assert(offset + seekWindowLength <= (int)inputBuffer.numSamples());
            var start = this.inputBuffer.startIndex + 2 * (offset + this.seekWindowLength - this.overlapLength);
            this.pMidBuffer.set(this._inputBuffer.vector.subarray(start, start + 2 * this.overlapLength))

            // Remove the processed samples from the input buffer. Update
            // the difference between integer & nominal skip step to 'skipFract'
            // in order to prevent the error from accumulating over time.
            this.skipFract += this.nominalSkip;   // real skip size
            ovlSkip = Math.floor(this.skipFract); // rounded to integer skip
            this.skipFract -= ovlSkip;            // maintain the fraction part, i.e. real vs. integer skip
            this._inputBuffer.receive(ovlSkip);
        }
    }
});

// https://bugs.webkit.org/show_bug.cgi?id=57295
extend(Stretch.prototype, {
    get tempo() {
      return this._tempo;
    }
});

//////////////

function SoundTouch() {
    this.rateTransposer = new RateTransposer(false);
    this.tdStretch = new Stretch(false);

    this._inputBuffer = new FifoSampleBuffer();
    this._intermediateBuffer = new FifoSampleBuffer();
    this._outputBuffer = new FifoSampleBuffer();

    this._rate = 0;
    this.tempo = 0;

    this.virtualPitch = 1.0;
    this.virtualRate = 1.0;
    this.virtualTempo = 1.0;

    this._calculateEffectiveRateAndTempo();
}

extend(SoundTouch.prototype, {
    clear: function () {
        rateTransposer.clear();
        tdStretch.clear();
    },

    clone: function () {
        var result = new SoundTouch();
        result.rate = rate;
        result.tempo = tempo;
        return result;
    },

    get rate() {
        return this._rate;
    },

    set rate(rate) {
        this.virtualRate = rate;
        this._calculateEffectiveRateAndTempo();
    },

    set rateChange(rateChange) {
        this.rate = 1.0 + 0.01 * rateChange;
    },

    get tempo() {
        return this._tempo;
    },

    set tempo(tempo) {
        this.virtualTempo = tempo;
        this._calculateEffectiveRateAndTempo();
    },

    set tempoChange(tempoChange) {
        this.tempo = 1.0 + 0.01 * tempoChange;
    },

    set pitch(pitch) {
        this.virtualPitch = pitch;
        this._calculateEffectiveRateAndTempo();
    },

    set pitchOctaves(pitchOctaves) {
        this.pitch = Math.exp(0.69314718056 * pitchOctaves);
        this._calculateEffectiveRateAndTempo();
    },

    set pitchSemitones(pitchSemitones) {
        this.pitchOctaves = pitchSemitones / 12.0;
    },

    get inputBuffer() {
        return this._inputBuffer;
    },

    get outputBuffer() {
        return this._outputBuffer;
    },

    _calculateEffectiveRateAndTempo: function () {
        var previousTempo = this._tempo;
        var previousRate = this._rate;

        this._tempo = this.virtualTempo / this.virtualPitch;
        this._rate = this.virtualRate * this.virtualPitch;

        if (testFloatEqual(this._tempo, previousTempo)) {
            this.tdStretch.tempo = this._tempo;
        }
        if (testFloatEqual(this._rate, previousRate)) {
            this.rateTransposer.rate = this._rate;
        }

        if (this._rate > 1.0) {
            if (this._outputBuffer != this.rateTransposer.outputBuffer) {
                this.tdStretch.inputBuffer = this._inputBuffer;
                this.tdStretch.outputBuffer = this._intermediateBuffer;

                this.rateTransposer.inputBuffer = this._intermediateBuffer;
                this.rateTransposer.outputBuffer = this._outputBuffer;
            }
        }
        else {
            if (this._outputBuffer != this.tdStretch.outputBuffer) {
                this.rateTransposer.inputBuffer = this._inputBuffer;
                this.rateTransposer.outputBuffer = this._intermediateBuffer;

                this.tdStretch.inputBuffer = this._intermediateBuffer;
                this.tdStretch.outputBuffer = this._outputBuffer;
            }
        }
    },

    process: function () {
        if (this._rate > 1.0) {
            this.tdStretch.process();
            this.rateTransposer.process();
        }
        else {
            this.rateTransposer.process();
            this.tdStretch.process();
        }
    }
});