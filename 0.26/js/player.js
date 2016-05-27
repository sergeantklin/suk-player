function getAudioContextClass(){
	var contextClass = (window.AudioContext ||
	  window.webkitAudioContext ||
	  window.mozAudioContext ||
	  window.oAudioContext ||
	  window.msAudioContext);
	if (contextClass) {
		var context = new contextClass();
	} else{
		//console.log ('audio context error')
	}
	return context;
}

function getSoundTouchSource(player){
	var source = {
		extract: function (target, numFrames, position) {
			var buffer = player.getSoundBuffer();
			var l = buffer.getChannelData(0);
			if (buffer.numberOfChannels > 1){
				var r = buffer.getChannelData(1);
			} else {
				var r = buffer.getChannelData(0);
			}
			for (var i = 0; i < numFrames; i++) {
				target[i * 2] = l[i + position];
				target[i * 2 + 1] = r[i + position];
			}
			return Math.min(numFrames, l.length - position);
		}
	};
	return source;
}


//////-------------------


function SUK_Player(initParams){
	initParams = initParams||{};
	var player = {}; // return object
	var audioContext = getAudioContextClass();
	if(!audioContext){
		initParams.onAudioContextError&&initParams.onAudioContextError();
	}
	var audioTag = new Audio(),
		preloadUrlArray = [],
		preloadRequest,
		playerPosition = 0,
		playingTimeout,
		pitch=1,
		tempo=1,
		playing=false;
		
	if(audioContext){
		var	soundTouch,
			bufferDuration,
			BUFFER_SIZE = 4096,
			soundBuffer,
			
			soundTouchSource = getSoundTouchSource(player),
			audioNode = audioContext.createScriptProcessor ? audioContext.createScriptProcessor(BUFFER_SIZE, 2, 2) : audioContext.createJavaScriptNode(BUFFER_SIZE, 2, 2),
			samples = new Float32Array(BUFFER_SIZE * 2),
			
			audioTagNode,
			
			simpleFilter,
			filters,
			gainNode,
			leftchannel = [],
			rightchannel = [],
			bufferRequest,
			loaded = false;
	};
	

	function onPitchAudioProcess (e){
		if (soundBuffer.getChannelData){
			//pos+=BUFFER_SIZE / audioContext.sampleRate;
			var l = e.outputBuffer.getChannelData(0);
			var r = e.outputBuffer.getChannelData(1);
			var framesExtracted = simpleFilter.extract(samples, BUFFER_SIZE);
			for (var i = 0; i < framesExtracted; i++) {
				l[i] = samples[i * 2];
				r[i] = samples[i * 2 + 1];
			}
			leftchannel.push (new Float32Array (l));
			rightchannel.push (new Float32Array (r));
			if (framesExtracted == 0) {
				pause(true);
				onEnd();
			} else{

			}			
		}
	}

	function attachSoundTouch(){
		var currentPosition = playerPosition * (bufferDuration * audioContext.sampleRate);
		currentPosition = Math.round(soundBuffer.length*playerPosition);
		soundTouch = new SoundTouch();
		soundTouch.pitch = pitch;
		soundTouch.tempo = tempo;
		simpleFilter = new SimpleFilter(soundTouchSource, soundTouch);
		
		simpleFilter.sourcePosition = currentPosition;		
	}
	
	function decodeData(data,url){
		audioContext.decodeAudioData(data, function(theBuffer){
				if(audioTag.src.indexOf(url)==-1) return;
				soundBuffer = theBuffer;
				bufferDuration = soundBuffer.duration;
				initParams.onDecode&&initParams.onDecode();
			}, function(e){
				if(audioTag.src.indexOf(url)==-1) return;
				initParams.onDecodeError&&initParams.onDecodeError(e);
			}
		)	
	}
	function setTone(newPitch) {
		if(audioContext){
			if (playing){
				pause(true);
				pitch = newPitch;
				play(true);
			} else{
				pitch = newPitch;
			}
		}
	}	
	function setFilter(freqArray) {
		if(audioContext){
			for(var a=freqArray,i=0,ii=a.length;i<ii;i++){
				filters[i].gain.value = a[i];
			}
		}
	}	
	function detachFilter() {
		if(audioContext){
			setFilter([0,0,0,0,0,0,0,0,0,0])
		}
	}
	function setPosition(value) {
		if (playing){
			pause(true);
			playerPosition = value;
			play(true);
		} else{
			playerPosition = value;	
		}
		//initParams.onTimeUpdate&&initParams.onTimeUpdate(playerPosition);
	}	
	function setSpeed(value) {
		tempo = value;
		audioTag.playbackRate = value;
		if(audioContext&&playing&&(pitch!=1)){
			pause(true);
			play(true);
		}
	}	
	function setVolume(value) {
		if(audioContext){
			gainNode.gain.value = value;
		}else{
			if((value<0)||(value>1)){
			
			} else{
				audioTag.volume = value;
			}
		}
	}	
	function connectNodeToDestination(node){
		if(audioContext){
			node.connect(gainNode);
			gainNode.connect(filters[0]);
			filters[filters.length - 1].connect(audioContext.destination);		
			//node.connect(audioContext.destination);
		}
	}	
	function play(silent) {
		try{
			if(pitch==1){
				var time = audioTag.duration&&playerPosition&&audioTag.duration*playerPosition||0;
				audioTag.currentTime = time;
				connectNodeToDestination(audioTagNode);
				audioTag.play();
			}else{
				attachSoundTouch();
				connectNodeToDestination(audioNode);
			}
			if(!silent){
				//initParams.onPlay&&initParams.onPlay();
			}
			playing = true;
		}
		catch(e){}
	}
	
	function getDuration() {
		return audioTag.duration;
	}
	function pause(silent) {
		if(pitch==1){
			audioTag.pause();
		}else{
			audioNode.disconnect();
		}
		if(!silent){
			initParams.onPause&&initParams.onPause();
		}
		playing = false;
	}

	function onEnd(){
		setDefaults();
		initParams.onEnd&&initParams.onEnd();
	}
	
	function preBuffer(url) {
		if(bufferRequest) bufferRequest.abort();
		bufferRequest = new XMLHttpRequest();
		bufferRequest.open('GET', url, true);
		bufferRequest.responseType = 'arraybuffer';
		bufferRequest.onload = function() {
			initParams.onLoad&&initParams.onLoad();
			decodeData(bufferRequest.response,url);
		}
		bufferRequest.onprogress = function(event) {
			initParams.onLoadProgress&&initParams.onLoadProgress(event.loaded/event.total );
		}		
		bufferRequest.onerror = function(event) {
			initParams.onLoadError&&initParams.onLoadError(event);
		}		
		bufferRequest.onabort = function(event) {
			initParams.onLoadAbort&&initParams.onLoadAbort(event);
		}
		bufferRequest.send();
	}
	function setDefaults() {
		pause();
		
		if(audioTag.currentTime) audioTag.currentTime = 0;
		setSpeed(1);
		setTone(1);
		
		setPosition(0);
		setVolume(1);
		detachFilter();
		if(audioContext){
			
			soundBuffer = audioContext.createBuffer(2, 22050, 44100);
		}
				
	}
	function load(url) {
		loaded = false;
		setDefaults();
		audioTag.src='';
		audioTag.src=url;

		if(audioContext){
			preBuffer(url);
		}
	}	
	
	function getSoundBuffer() {
		return soundBuffer;
	}
	
	function onPlaying(){
		if (playing){
			var seconds = 0;
			if(pitch==1){
				seconds = audioTag.currentTime;
				playerPosition = audioTag.currentTime / audioTag.duration;
			} else{
				playerPosition = simpleFilter.sourcePosition / (bufferDuration * audioContext.sampleRate);
				seconds = playerPosition*bufferDuration;
			}
			initParams.onTimeUpdate&&initParams.onTimeUpdate(seconds);	
		}
	}
	
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
	function init(){
		playing = false;
		audioTag.preload = 'media';
		audioTag.controls = true;
		//audioTag.autoplay = true;
		//audioTag.crossOrigin = "anonymous";
		//document.body.appendChild(audioTag);
		audioTag.onended = onEnd;
		
		audioTag.onerror = function(e) {
			initParams.onPlayerError&&initParams.onPlayerError(e.currentTarget.error);
		};
		audioTag.onwaiting = function(){
			initParams.onBuffer&&initParams.onBuffer();
		};		
		audioTag.onplaying  = function(){
			initParams.onBufferEnd&&initParams.onBufferEnd();
		};		
		audioTag.onstalled  = function(){
			initParams.onPlayerError&&initParams.onPlayerError('stalled');
		};		
		audioTag.onsuspend  = function(){
			initParams.onPlayerError&&initParams.onPlayerError('suspend');
		};		
		audioTag.onabort  = function(){
			initParams.onPlayerError&&initParams.onPlayerError('abort');
		};
		
		audioTag.oncanplay  = function(a){
			if(!loaded){
				loaded = true;
				initParams.onCanPlay&&initParams.onCanPlay();
			}
		}
		
		if(audioContext){
			filters = createFilters();
			gainNode = audioContext.createGain();
			audioTagNode = audioContext.createMediaElementSource(audioTag);
			audioNode.onaudioprocess = onPitchAudioProcess;
		}
		
		playingTimeout = setInterval(onPlaying,100);

	}
	function createFilters() {
		function createFilter (frequency) {
			var filter = audioContext.createBiquadFilter();
			filter.type = 'peaking';
			filter.frequency.value = frequency;
			filter.Q.value = 1;
			filter.gain.value = 0;
			return filter;
		};
		var frequencies = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000],
		filters;
		filters = frequencies.map(createFilter);
		filters.reduce(function (prev, curr) {
			prev.connect(curr);
			return curr;
		});
		return filters;
	};
	init();
	player.initParams=initParams;
	player.load=load;
	player.play=play;
	player.pause=pause;
	player.getSoundBuffer = getSoundBuffer;
	player.setTone = setTone;
	player.setPosition = setPosition;
	player.setFilter = setFilter;
	player.setSpeed = setSpeed;
	player.setVolume = setVolume;
	player.getDuration = getDuration;
	player.detachFilter = detachFilter;
	player.preload = preload;
	player.version = 0.26;
	
	return player;

}

