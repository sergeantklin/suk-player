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
				initParams.onPlay&&initParams.onPlay(position,soundBuffer.duration);
			}
			lastPosition = position;
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
		audioNode.onaudioprocess = onPitchAudioProcess;
		soundBuffer = options.soundBuffer;
		var currentPosition = options.position * (options.soundBuffer.duration * initParams.audioContext.sampleRate);
		currentPosition = Math.round(options.soundBuffer.length*options.position);
		blob = null;
		soundTouch = new SoundTouch();
		soundTouch.pitch = options.pitch;
		soundTouch.tempo = options.tempo;
		simpleFilter = new SimpleFilter(soundTouchSource, soundTouch);
		simpleFilter.sourcePosition = currentPosition;	
		return audioNode;
	}
	 function getSourcePosition(){
		 return simpleFilter.sourcePosition/soundBuffer.length*soundBuffer.duration;
	 }
	return {
		attachSoundTouch:attachSoundTouch,
		getSourcePosition:getSourcePosition
	};

};

