function SUK_Player(_initParams){
    var initParams = _initParams||{};
		var htmlPlayer = new Audio();
		htmlPlayer.oncanplay = function(){
			initParams.onCanPlay&&initParams.onCanPlay();
			initParams.onDecode&&initParams.onDecode();
		}
		htmlPlayer.ontimeupdate = function(){
			initParams.onTimeUpdate&&initParams.onTimeUpdate(htmlPlayer.currentTime);
		}
		initParams.onAudioContextError&&initParams.onAudioContextError();
	function init(){
		position = 0;
		pitch = 1;
		tempo = 1;
		volume = 1;		
	}
	function getDevices(){
		return null;
	};
	function load(_url){
			htmlPlayer.src = _url;
			console.log(htmlPlayer);
	};
	function preload(_urlArray){
		
	};
	function onPlay(_position,duration, correction){
		correction = correction||0;
		if(!_position) return;
		position = _position;
		if((Math.round(_position*1000)==1000) || (!playing)){
			pause(true);
			//stopReplay(true);
			initParams.onEnd&&initParams.onEnd();
		}else{
			initParams.onTimeUpdate&&initParams.onTimeUpdate(_position*duration+(correction)/1000);
		}
	}
	function play(supress) {
		if(!supress){
			console.log('YOU CHOOSE PLAY');
		}
    htmlPlayer.play();
	}
	function pause(supress) {
		if(!supress){
			console.log('YOU CHOOSE PAUSE');
		}
		htmlPlayer.pause();
	}	
	function startRecord() {
		
	}			
	function stopReplay(supress) {

	}
	function replay(delay, position, supress) {

	}
	function setTone(_newPitch, supress) {

	}	
	function setFilter(_freqArray, supress) {

	}	
	function detachFilter(supress) {

	}
	function setPosition(_value, supress) {
		if(!supress){
			console.log('YOU CHOOSE SET POSITION');
		}
		htmlPlayer.currentTime = _value;
	}	
	function setSpeed(_value, supress) {
		if(!supress){
			console.log('YOU CHOOSE SET SPEED');
		}
		htmlPlayer.playbackRate = _value;
	}	
	function getDuration() {
		return htmlPlayer.duration;
	}	
	function getReplayDuration() {

	}	
	function setVolume(_value, supress) {
		if(!supress){
			console.log('YOU CHOOSE SET VOLUME');
		}
		htmlPlayer.volume = _value;
	}	
	function createBuffer(channels){
	}
	function getBlobs(_url) {
	}
	function setReverbGain(value){
	}	
	function setReverbDelay(value){
	}		
	function setReverbConvolver(value){
	}	
	function startCapture(_options){
	}	
	function stopCapture(){
	}	
	function setRecordFilter(value){
	}
	function setMicLevel(value){
	}		
	function setMicOutput(value){
	}
	function updateRecord() {
	};
	function setAnalyseMusic(value) {
	};
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
		setAnalyseMusic:setAnalyseMusic,
		version : '0.922.m'
	};

};