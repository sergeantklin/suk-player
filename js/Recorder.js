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
		if (!stream||(destinationGainNode.gain.value==0)){
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

