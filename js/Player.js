function SUK_Player(_initParams){
	var initParams = _initParams||{},
		mediaElements = new MediaElements(),
		audioContext = mediaElements.getAudioContextClass(),
		BUFFER_SIZE = 4096;
  var useHtmlPlayer = !audioContext || (navigator.userAgent.toLowerCase().indexOf('webkit')==-1);
	
  // писалка видео и аудио с камеры
  if(audioContext){
    var	recorder = new Recorder({
      logging:initParams.logging,
      audioContext:audioContext,
      onRecordLevel:initParams.onRecordLevel,
      onStopRecord:initParams.onStopRecord,
      BUFFER_SIZE:BUFFER_SIZE,
      filters: mediaElements.createFilters()
    })
  }
  // текущее положение проигрывателя в процентах
  var position,
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
  
  logging = initParams.logging
    if(useHtmlPlayer){
		var htmlPlayer = new Audio();
		htmlPlayer.oncanplay = function(){
			initParams.onCanPlay&&initParams.onCanPlay();
			initParams.onDecode&&initParams.onDecode();
		}
		htmlPlayer.ontimeupdate = function(){
			initParams.onTimeUpdate&&initParams.onTimeUpdate(htmlPlayer.currentTime);
		}
		htmlPlayer.onended = function(){
			initParams.onEnd&&initParams.onEnd();
		}
		initParams.onAudioContextError&&initParams.onAudioContextError();
	} else{
			// загрузчик аудио данных (мелодии) по сети
			var preloader = new Preloader({
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
			/*
			replaySourceNode,
			recordingAudioNode = new RecordingAudioNode({
				audioContext:audioContext,
				BUFFER_SIZE:BUFFER_SIZE,
				supressRecord:false
				
			}),
			*/
			analyseMusic = false,
			analyserNode = audioContext.createAnalyser(),
			analyserFrequencyData = new Uint8Array(10),
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
		if(useHtmlPlayer){
			htmlPlayer.src = _url;
			logging && console.log(htmlPlayer);
			return;
		}
		if(audioNode){
			pause();
		}
    soundBuffer = audioContext.createBuffer(1, 1, audioContext.sampleRate);
    bufferDuration = 0;
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
		
		if(analyseMusic){
			_node.connect(analyserNode);
			analyserNode.connect(gainNode);
		} else{
			_node.connect(gainNode);
		}
		
		
		
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
		if((_position>1) || (Math.round(_position*1000)==1000)){
			pause(true);
			//stopReplay(true);
			initParams.onEnd&&initParams.onEnd();
		}else{
			initParams.onTimeUpdate&&initParams.onTimeUpdate(_position*duration+(correction)/1000);
		}
	}
	function play(supress) {
		if(!supress){
			logging && console.log('YOU CHOOSE PLAY');
		}
		if(useHtmlPlayer){
			htmlPlayer.play();
			return;
		}
    if(!soundBuffer || !bufferDuration) {
      return
    }
		connectNodeToDestination(audioNode);
		onPlay();
		playing = true;
		//playing = setInterval(onPlay,100);
		!supress&&initParams.onPlay&&initParams.onPlay();
	}
	function pause(supress) {
		if(!supress){
			logging && console.log('YOU CHOOSE PAUSE');
		}
		recorder&&recorder.stopRecord(supress);
		if(useHtmlPlayer){
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
		!supress&&initParams.onPause&&initParams.onPause();
	}	
	function startRecord() {
		if(!audioContext){
			return;
		}
		logging && console.log('YOU CHOOSE START RECORD');
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
			logging && console.log('YOU CHOOSE STOP REPLAY');
		}
		//replaySourceNode&&replaySourceNode.disconnect();
		//setPosition(0);
		recorder.stopReplay(supress);
	}
	function replay(delay, position, supress) {
		logging && console.log('DISABLED!');
    /*
		return;
		if(!audioContext){
			return;
		}
		if(!supress){
			logging && console.log('YOU CHOOSE REPLAY');
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
    */
	}
	function setTone(_newPitch, supress) {
		if(useHtmlPlayer){
			return;
		}
		if(!supress){
			logging && console.log('YOU CHOOSE SET TONE');
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
		if(useHtmlPlayer){
			return;
		}
		if(!supress){
			logging && console.log('YOU CHOOSE SET FILTER');
		}
		var filters = mediaElements.filters;
		for(var a=_freqArray,i=0,ii=a.length;i<ii;i++){
			filters[i].gain.value = a[i];
		}
	}	
	function detachFilter(supress) {
		if(useHtmlPlayer){
			return;
		}
		if(!supress){
			logging && console.log('YOU CHOOSE DETACH FILTER');
		}
		setFilter([0,0,0,0,0,0,0,0,0,0], true)
	}
	function setPosition(_value, supress) {
		if(!supress){
			logging && console.log('YOU CHOOSE SET POSITION');
		}
		if(useHtmlPlayer){
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
			logging && console.log('YOU CHOOSE SET SPEED');
		}
		if(useHtmlPlayer){
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
		if(useHtmlPlayer){
			return htmlPlayer.duration;
		}
		return bufferDuration;
	}	
	function getReplayDuration() {
		logging && console.log('DISABLED!');
    /*
		return;
		if(useHtmlPlayer){
			return htmlPlayer.duration;
		}
		return recordingAudioNode.getDuration();
    */
	}	
	function setVolume(_value, supress) {
		if(!supress){
			logging && console.log('YOU CHOOSE SET VOLUME');
		}
		if(useHtmlPlayer){
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
		logging && console.log('YOU CHOOSE START CAPTURE');
		recorder.startCapture(_options);
	}	
	function stopCapture(){
		if(!audioContext){
			return;
		}
		logging && console.log('YOU CHOOSE STOP CAPTURE');
		recorder.stopCapture();
	}	
	function setRecordFilter(value){
		if(!audioContext){
			return;
		}
		logging && console.log('YOU CHOOSE SET RECORD FILTER');
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
	function updateRecord() {
		if(useHtmlPlayer){
			return;
		}
		requestAnimationFrame(updateRecord);
		if (!analyseMusic || !playing){
			return;
		}
		// Get the new frequency data
		analyserNode.getByteFrequencyData(analyserFrequencyData);
		initParams.onMusicLevel&&initParams.onMusicLevel(analyserFrequencyData);
	};
	function setAnalyseMusic(value) {
		analyseMusic = value;
		pause();
	};
  function setPlay () {
    if(!useHtmlPlayer){
      attachPitchPlayer();
		}
    play();
  };
  function setPause () {
    pause();
  };
	updateRecord();
	return {
		load:load,
		preload:preload,
		play:setPlay,
		setPosition:setPosition,
		setTone:setTone,
		setSpeed:setSpeed,
		setVolume:setVolume,
		pause:setPause,
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
		setAnalyseMusic:setAnalyseMusic,
		version : 0.932
	};

};