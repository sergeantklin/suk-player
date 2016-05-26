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
		var	recorder = new Recorder({
				audioContext:audioContext,
				onRecordLevel:initParams.onRecordLevel,
				onStopRecord:initParams.onStopRecord,
				BUFFER_SIZE:BUFFER_SIZE,
				filters: mediaElements.createFilters()
			}),
			preloader = new Preloader({
				audioContext:audioContext
			}),
			pitchPlayer = new PitchPlayer({
				audioContext:audioContext,
				BUFFER_SIZE:BUFFER_SIZE,
				onPlay:onPlay,
			}),
			recPitchPlayer = new PitchPlayer({
				audioContext:audioContext,
				BUFFER_SIZE:BUFFER_SIZE,
				onPlay:onPlay,
			}),
			audioNode,
			gainNode = audioContext.createGain(),
			position,
			pitch,
			tempo,
			volume,
			soundBuffer,
			playing,
			replaySourceNode,
			recordingAudioNode = new RecordingAudioNode({
				audioContext:audioContext,
				BUFFER_SIZE:BUFFER_SIZE,
				//supressRecord:true
				
			}),
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
		filters[filters.length - 1].connect(recordingAudioNode);		
		recordingAudioNode.connect(audioContext.destination);		
	}
		setInterval(function(){
		console.log(pitchPlayer.getSourcePosition())
		
	},100);
	function onPlay(_position,duration){
		if(!_position) return;
		position = _position;
		if(Math.round(_position*1000)==1000){
			pause(true);
			stopReplay(true);
			initParams.onEnd&&initParams.onEnd();
		}else{
			initParams.onTimeUpdate&&initParams.onTimeUpdate(_position*duration);
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
		//clearInterval(playing);
		playing = null;
		audioNode&&audioNode.disconnect();
		recordingAudioNode.stopRecord();
		recorder.stopRecord(supress);
		//recorder.trimBuffer(recordingAudioNode.getLength());
		//console.log(recordingAudioNode.getBuffer().duration - recorder.getBuffer().duration)
		!supress&&initParams.onPause&&initParams.onPause();
	}	
	function startRecord() {
		if(!audioContext){
			return;
		}
		console.log('YOU CHOOSE START RECORD');
		setPosition(0, true);
		recordingAudioNode.startRecord();
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
		replaySourceNode&&replaySourceNode.disconnect();
		//setPosition(0);
		recorder.stopReplay(supress);
	}
	function replay(delay, position, supress) {
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
			//console.log(channel)
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
		return {
			video : recorder.getVideo(),
			voice : new Blob([audioBufferToWav(recorder.getBuffer())],{type: 'audio/webm'}),
			original : (recorder.getOriginalBuffer().length? new Blob([audioBufferToWav(recorder.getOriginalBuffer())],{type: 'audio/webm'}):null),
			music : new Blob([audioBufferToWav(recordingAudioNode.getBuffer())],{type: 'audio/webm'}),
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
		version : 0.89
	};

};

