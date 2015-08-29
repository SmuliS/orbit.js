import Operation from 'orbit/operation';

var verifyLocalStorageContainsRecord = function(namespace, type, id, record, ignoreFields) {
  var recordKey = [namespace, type, id].join('/');

  var actual = JSON.parse(window.localStorage.getItem(recordKey));

  if (ignoreFields) {
    for (var i = 0, l = ignoreFields.length, field; i < l; i++) {
      field = ignoreFields[i];
      actual[id][field] = record[field];
    }
  }

  deepEqual(actual,
            record,
            'data in local storage matches expectations');
};

var verifyLocalStorageIsEmpty = function(namespace) {
  var contents = JSON.parse(window.localStorage.getItem(namespace));
  if (contents === null) {
    equal(contents, null, 'local storage should still be empty');
  } else {
    deepEqual(contents, {}, 'local storage should still be empty');
  }
};

var equalOps = function(result, expected, msg) {
  deepEqual(result && result.serialize ? result.serialize() : result,
            expected && expected.serialize ? expected.serialize() : expected,
            msg);
};

function op(opType, path, value){
  var operation = new Operation({op: opType, path: path});
  if(value) operation.value = value;
  return operation;
}

var verifyLocalForageContainsRecord = function(namespace, type, record, ignoreFields) {
  var expected = {};
  expected[record.id] = record;

  stop();
  window.localforage.getItem(namespace).then(function(obj){
    var actual;
    if (type) actual = obj[type];
    if (ignoreFields) {
      for (var i = 0, l = ignoreFields.length, field; i < l; i++) {
        field = ignoreFields[i];
        actual[record.id][field] = record[field];
      }
    }
    deepEqual(actual,
              expected,
              'data in local forage matches expectations');
    start();
  });

};

var verifyLocalForageIsEmpty = function(namespace) {
  stop();
  window.localforage.getItem(namespace).then(function(contents){
    if (contents === null) {
      equal(contents, null, 'local forage should still be empty');
    } else {
      deepEqual(contents, {}, 'local forage should still be empty');
    }
    start();
  });

};

export { verifyLocalStorageContainsRecord, verifyLocalStorageIsEmpty, equalOps, op, verifyLocalForageContainsRecord, verifyLocalForageIsEmpty };
