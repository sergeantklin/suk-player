function RecordingAudioNode(_initParams){
	console.error(1);
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