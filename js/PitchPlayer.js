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
		playingInterval = null;
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
				if(playingInterval){
					startPlayingInterval();
				};
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
		if((options.pitch!=1)|| navigator.userAgent.toLowerCase().indexOf('firefox') > -1){
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

