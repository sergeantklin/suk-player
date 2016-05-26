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

