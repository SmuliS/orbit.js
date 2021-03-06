import Orbit from '../src/main';
import TaskQueue from '../src/task-queue';
import { Task, Performer } from '../src/task';
import evented, { Evented } from '../src/evented';
import { FakeBucket } from './test-helper';

const { Promise } = Orbit;
const { module, test } = QUnit;

///////////////////////////////////////////////////////////////////////////////

module('TaskQueue', function() {
  test('can be instantiated', function(assert) {
    const performer: Performer = {
      perform(task: Task): Promise<void> { return Promise.resolve(); }
    };
    const queue = new TaskQueue(performer);
    assert.ok(queue);
  });

  test('#autoProcess is enabled by default', function(assert) {
    const performer: Performer = {
      perform(task: Task): Promise<void> { return Promise.resolve(); }
    };
    const queue = new TaskQueue(performer);
    assert.equal(queue.autoProcess, true, 'autoProcess === true');
  });

  test('auto-processes pushed tasks sequentially by default', function(assert) {
    assert.expect(21);
    const done = assert.async();
    let order = 0;

    const performer: Performer = {
      perform(task: Task): Promise<void> {
        transformCount++;
        if (transformCount === 1) {
          assert.equal(order++, 1, 'transform - op1 - order');
          assert.strictEqual(task.data, op1, 'transform - op1 passed as argument');
        } else if (transformCount === 2) {
          assert.equal(order++, 4, 'transform - op2 - order');
          assert.strictEqual(task.data, op2, 'transform - op2 passed as argument');
        }
        return Promise.resolve();
      }
    };

    const queue = new TaskQueue(performer);

    let op1 = { op: 'add', path: ['planets', '123'], value: 'Mercury' };
    let op2 = { op: 'add', path: ['planets', '234'], value: 'Venus' };
    let transformCount = 0;

    queue.on('beforeTask', function(task: Task) {
      if (transformCount === 0) {
        assert.equal(order++, 0, 'op1 - order of beforeTask event');
        assert.strictEqual(task.data, op1, 'op1 - beforeTask - data correct');
        assert.strictEqual(queue.current, task, 'op1 - beforeTask - current task matches expectation');
      } else if (transformCount === 1) {
        assert.equal(order++, 3, 'op2 - order of beforeTask event');
        assert.strictEqual(task.data, op2, 'op2 - beforeTask - data correct');
        assert.strictEqual(queue.current, task, 'op2 - beforeTask - current task matches expectation');
      }
    });

    queue.on('task', function(task: Task) {
      if (transformCount === 1) {
        assert.equal(order++, 2, 'op1 - order of task event');
        assert.strictEqual(task.data, op1, 'op1 processed');
        assert.equal(queue.length, 1, 'op1 - after task - queue length');
        assert.strictEqual(queue.current.data, op2, 'after op1 - current task is op2');
        assert.equal(queue.processing, false, 'after op1 - queue.processing === false between tasks');
      } else if (transformCount === 2) {
        assert.equal(order++, 5, 'op2 - order of task event');
        assert.strictEqual(task.data, op2, 'op2 processed');
        assert.equal(queue.length, 0, 'op2 - after task - queue length');
        assert.strictEqual(queue.current, undefined, 'after op2 - current task is empty');
        assert.equal(queue.processing, false, 'after op2 - queue.processing === false');
      }
    });

    queue.on('complete', function() {
      assert.equal(order++, 6, 'order of complete event');
      done();
    });

    queue.push({
      type: 'transform',
      data: op1
    });

    queue.push({
      type: 'transform',
      data: op2
    });
  });

  test('with `autoProcess` disabled, will process pushed functions sequentially when `process` is called', function(assert) {
    assert.expect(5);
    const done = assert.async();

    const performer: Performer = {
      perform(task: Task): Promise<void> {
        transformCount++;
        if (transformCount === 1) {
          assert.strictEqual(task.data, op1, 'transform - op1 passed as argument');
        } else if (transformCount === 2) {
          assert.strictEqual(task.data, op2, 'transform - op2 passed as argument');
        }
        return Promise.resolve();
      }
    };

    const queue = new TaskQueue(performer);

    let op1 = { op: 'add', path: ['planets', '123'], value: 'Mercury' };
    let op2 = { op: 'add', path: ['planets', '234'], value: 'Venus' };
    let transformCount = 0;

    queue.on('task', function(task) {
      if (transformCount === 1) {
        assert.strictEqual(task.data, op1, 'op1 processed');
      } else if (transformCount === 2) {
        assert.strictEqual(task.data, op2, 'op2 processed');
      }
    });

    queue.on('complete', function() {
      assert.ok(true, 'queue completed');
      done();
    });

    queue.push({
      type: 'transform',
      data: op1
    });

    queue.push({
      type: 'transform',
      data: op2
    });

    queue.process();
  });

  test('can enqueue tasks while another task is being processed', function(assert) {
    assert.expect(9);
    const done = assert.async();

    @evented
    class Trigger implements Evented {
      // Evented interface stubs
      on: (event: string, callback: Function, binding?: object) => void;
      off: (event: string, callback: Function, binding?: object) => void;
      one: (event: string, callback: Function, binding?: object) => void;
      emit: (event: string, ...args) => void;
      listeners: (event: string) => any[];
    }

    let trigger = new Trigger;

    const performer: Performer = {
      perform(task: Task): Promise<void> {
        let promise;
        let op = task.data;
        if (op === op1) {
          assert.equal(++order, 1, 'transform with op1');
          promise = new Promise(function(resolve) {
            trigger.on('start1', function() {
              assert.equal(++order, 2, 'transform with op1 resolved');
              resolve();
            });
          });
        } else if (op === op2) {
          assert.equal(++order, 4, 'transform with op2');
          promise = new Promise(function(resolve) {
            assert.equal(++order, 5, 'transform with op2 resolved');
            resolve();
          });
        }
        return promise;
      }
    };

    const queue = new TaskQueue(performer);

    let op1 = { op: 'add', path: ['planets', '123'], value: 'Mercury' };
    let op2 = { op: 'add', path: ['planets', '234'], value: 'Venus' };
    let order = 0;

    queue.on('task', function(task) {
      if (task.data === op1) {
        assert.equal(++order, 3, 'op1 completed');
      } else if (task.data === op2) {
        assert.equal(++order, 6, 'op2 completed');
      }
    });

    queue.on('complete', function() {
      assert.equal(++order, 7, 'queue completed');
    });

    queue.push({
      type: 'transform',
      data: op1
    });

    queue.push({
      type: 'transform',
      data: op2
    });

    queue.process()
      .then(function() {
        assert.equal(queue.empty, true, 'queue processing complete');
        assert.equal(++order, 8, 'queue resolves last');
        done();
      });

    queue.reified
      .then(function() {
        trigger.emit('start1');
      });
  });

  test('will stop processing when an task errors', function(assert) {
    assert.expect(7);

    const performer: Performer = {
      perform(task: Task): Promise<void> {
        transformCount++;
        if (transformCount === 1) {
          assert.strictEqual(task.data, op1, 'transform - op1 passed as argument');
        } else if (transformCount === 2) {
          return Promise.reject(new Error(':('));
        }
        return Promise.resolve();
      }
    };

    const queue = new TaskQueue(performer, { autoProcess: false });

    let op1 = { op: 'add', path: ['planets', '123'], value: 'Mercury' };
    let op2 = { op: 'add', path: ['planets', '234'], value: 'Venus' };
    let transformCount = 0;

    queue.on('task', function(task) {
      if (transformCount === 1) {
        assert.strictEqual(task.data, op1, 'task - op1 processed');
      } else if (transformCount === 2) {
        assert.ok(false, 'op2 could not be processed');
      }
    });

    queue.on('fail', function(task, err) {
      assert.strictEqual(task.data, op2, 'fail - op2 failed processing');
      assert.equal(err.message, ':(', 'fail - error matches expectation');
    });

    queue.on('complete', function() {
      assert.ok(false, 'queue should not complete');
    });

    queue.push({
      type: 'transform',
      data: op1
    });

    queue.push({
      type: 'transform',
      data: op2
    });

    return queue.process()
      .catch((e) => {
        assert.equal(queue.empty, false, 'queue processing encountered a problem');
        assert.equal(queue.error.message, ':(', 'process error matches expectation');
        assert.strictEqual(queue.error, e, 'process error matches expectation');
      });
  });

  test('#retry resets the current task in an inactive queue and restarts processing', function(assert) {
    assert.expect(13);

    const performer: Performer = {
      perform(task: Task): Promise<void> {
        transformCount++;
        let op = task.data;
        if (transformCount === 1) {
          assert.strictEqual(op, op1, 'transform - op1 passed as argument');
        } else if (transformCount === 2) {
          return Promise.reject(new Error(':('));
        } else if (transformCount === 3) {
          assert.strictEqual(op, op2, 'transform - op2 passed as argument');
        } else if (transformCount === 4) {
          assert.strictEqual(op, op3, 'transform - op3 passed as argument');
        }
        return Promise.resolve();
      }
    };

    const queue = new TaskQueue(performer, { autoProcess: false });

    let op1 = { op: 'add', path: ['planets', '123'], value: 'Mercury' };
    let op2 = { op: 'add', path: ['planets', '234'], value: 'Venus' };
    let op3 = { op: 'add', path: ['planets', '234'], value: 'Venus' };
    let transformCount = 0;

    queue.on('task', function(task) {
      if (transformCount === 1) {
        assert.strictEqual(task.data, op1, 'task - op1 processed');
      } else if (transformCount === 3) {
        assert.strictEqual(task.data, op2, 'task - op2 processed');
      } else if (transformCount === 4) {
        assert.strictEqual(task.data, op3, 'task - op3 processed');
      }
    });

    queue.on('fail', function(task, err) {
      assert.strictEqual(task.data, op2, 'fail - op2 failed processing');
      assert.equal(err.message, ':(', 'fail - error matches expectation');
    });

    queue.on('complete', function() {
      assert.ok(true, 'queue should complete after processing has restarted');
    });

    queue.push({
      type: 'transform',
      data: op1
    });

    queue.push({
      type: 'transform',
      data: op2
    });

    queue.push({
      type: 'transform',
      data: op3
    });

    return queue.process()
      .catch((e) => {
        assert.equal(queue.empty, false, 'queue processing encountered a problem');
        assert.equal(queue.error.message, ':(', 'process error matches expectation');
        assert.strictEqual(queue.error, e, 'process error matches expectation');
        assert.strictEqual(queue.current.data, op2, 'op2 is current failed task');

        // skip current task and continue processing
        return queue.retry();
      });
  });

  test('#skip removes the current task from an inactive queue and restarts processing', function(assert) {
    assert.expect(9);

    const performer: Performer = {
      perform(task: Task): Promise<void> {
        transformCount++;
        let op = task.data;
        if (transformCount === 1) {
          assert.strictEqual(op, op1, 'transform - op1 passed as argument');
        } else if (transformCount === 2) {
          return Promise.reject(new Error(':('));
        } else if (transformCount === 3) {
          assert.strictEqual(op, op3, 'transform - op3 passed as argument');
        }
        return Promise.resolve();
      }
    };

    const queue = new TaskQueue(performer, { autoProcess: false });

    let op1 = { op: 'add', path: ['planets', '123'], value: 'Mercury' };
    let op2 = { op: 'add', path: ['planets', '234'], value: 'Venus' };
    let op3 = { op: 'add', path: ['planets', '234'], value: 'Venus' };
    let transformCount = 0;

    queue.on('task', function(task) {
      if (transformCount === 1) {
        assert.strictEqual(task.data, op1, 'task - op1 processed');
      } else if (transformCount === 2) {
        assert.strictEqual(task.data, op3, 'task - op3 processed');
      }
    });

    queue.on('fail', function(task, err) {
      assert.strictEqual(task.data, op2, 'fail - op2 failed processing');
      assert.equal(err.message, ':(', 'fail - error matches expectation');
    });

    queue.on('complete', function() {
      assert.ok(true, 'queue should complete after processing has restarted');
    });

    queue.push({
      type: 'transform',
      data: op1
    });

    queue.push({
      type: 'transform',
      data: op2
    });

    queue.push({
      type: 'transform',
      data: op3
    });

    return queue.process()
      .catch((e) => {
        assert.equal(queue.empty, false, 'queue processing encountered a problem');
        assert.equal(queue.error.message, ':(', 'process error matches expectation');
        assert.strictEqual(queue.error, e, 'process error matches expectation');

        // skip current task and continue processing
        return queue.skip();
      });
  });

  test('#shift can remove failed tasks from an inactive queue, allowing processing to be restarted', function(assert) {
    assert.expect(10);

    const performer: Performer = {
      perform(task: Task): Promise<void> {
        transformCount++;
        let op = task.data;
        if (transformCount === 1) {
          assert.strictEqual(op, op1, 'transform - op1 passed as argument');
        } else if (transformCount === 2) {
          return Promise.reject(new Error(':('));
        } else if (transformCount === 3) {
          assert.strictEqual(op, op3, 'transform - op3 passed as argument');
        }
        return Promise.resolve();
      }
    };

    const queue = new TaskQueue(performer, { autoProcess: false });

    let op1 = { op: 'add', path: ['planets', '123'], value: 'Mercury' };
    let op2 = { op: 'add', path: ['planets', '234'], value: 'Venus' };
    let op3 = { op: 'add', path: ['planets', '234'], value: 'Venus' };
    let transformCount = 0;

    queue.on('task', function(task) {
      if (transformCount === 1) {
        assert.strictEqual(task.data, op1, 'task - op1 processed');
      } else if (transformCount === 2) {
        assert.strictEqual(task.data, op3, 'task - op3 processed');
      }
    });

    queue.on('fail', function(task, err) {
      assert.strictEqual(task.data, op2, 'fail - op2 failed processing');
      assert.equal(err.message, ':(', 'fail - error matches expectation');
    });

    queue.on('complete', function() {
      assert.ok(true, 'queue should complete after processing has restarted');
    });

    queue.push({
      type: 'transform',
      data: op1
    });

    queue.push({
      type: 'transform',
      data: op2
    });

    queue.push({
      type: 'transform',
      data: op3
    });

    return queue.process()
      .catch((e) => {
        assert.equal(queue.empty, false, 'queue processing encountered a problem');
        assert.equal(queue.error.message, ':(', 'process error matches expectation');
        assert.strictEqual(queue.error, e, 'process error matches expectation');

        return queue.shift()
          .then(failedTask => {
            assert.strictEqual(failedTask.data, op2, 'op2, which failed, is returned from `shift`');
          })
          .then(function() {
            // continue processing
            return queue.process();
          });
      });
  });

  test('#unshift can add a new task to the beginning of an inactive queue', function(assert) {
    assert.expect(9);
    const done = assert.async();

    const performer: Performer = {
      perform(task: Task): Promise<void> {
        transformCount++;
        let op = task.data;
        if (transformCount === 1) {
          assert.strictEqual(op, op2, 'transform - op2 passed as argument');
        } else if (transformCount === 2) {
          assert.strictEqual(op, op1, 'transform - op1 passed as argument');
        }
        return Promise.resolve();
      }
    };

    const queue = new TaskQueue(performer, { autoProcess: false });

    let op1 = { op: 'add', path: ['planets', '123'], value: 'Mercury' };
    let op2 = { op: 'add', path: ['planets', '234'], value: 'Venus' };
    let transformCount = 0;

    let changeCount = 0;
    queue.on('change', function() {
      changeCount++;
      if (changeCount === 1) {
        assert.equal(queue.entries.length, 1);
      } else if (changeCount === 2) {
        assert.equal(queue.entries.length, 2);
      } else if (changeCount === 3) {
        assert.equal(queue.entries.length, 1);
      } else if (changeCount === 4) {
        assert.equal(queue.entries.length, 0);
      } else {
        assert.ok(false, 'should not get here');
      }
    });

    queue.on('task', function(task) {
      if (transformCount === 1) {
        assert.strictEqual(task.data, op2, 'op2 processed');
      } else if (transformCount === 2) {
        assert.strictEqual(task.data, op1, 'op1 processed');
      }
    });

    queue.on('complete', function() {
      assert.ok(true, 'queue completed');
      done();
    });

    queue.push({
      type: 'transform',
      data: op1
    });

    queue.unshift({
      type: 'transform',
      data: op2
    });

    queue.process();
  });

  test('#clear removes all tasks from an inactive queue', function(assert) {
    assert.expect(2);
    const done = assert.async();

    const performer: Performer = {
      perform(task: Task): Promise<void> {
        assert.ok(false, 'transform should not be called');
        return Promise.resolve();
      }
    };

    const queue = new TaskQueue(performer, { autoProcess: false });

    let op1 = { op: 'add', path: ['planets', '123'], value: 'Mercury' };
    let op2 = { op: 'add', path: ['planets', '234'], value: 'Venus' };

    queue.on('task', function() {
      assert.ok(false, 'no tasks should be processed');
    });

    queue.on('complete', function() {
      assert.ok(true, 'queue completed after clear');
    });

    queue.push({
      type: 'transform',
      data: op1
    });

    queue.push({
      type: 'transform',
      data: op2
    });

    queue.clear()
      .then(() => {
        assert.ok(true, 'queue was cleared');
        done();
      });
  });

  module('assigned a bucket', function(hooks) {
    const op1 = { op: 'add', path: ['planets', '123'], value: 'Mercury' };
    const op2 = { op: 'add', path: ['planets', '234'], value: 'Venus' };

    let bucket;

    hooks.beforeEach(function() {
      bucket = new FakeBucket({ name: 'fake-bucket' });
    });

    hooks.afterEach(function() {
      bucket = null;
    });

    test('requires a name for lookups in the bucket', function(assert) {
      assert.throws(
        function() {
          const performer: Performer = {
            perform(task: Task): Promise<void> {
              return Promise.resolve();
            }
          };
          let queue = new TaskQueue(performer, { bucket });
        },
        Error('Assertion failed: TaskQueue requires a name if it has a bucket'),
        'assertion raised');
    });

    test('will be reified with the tasks serialized in its bucket and immediately process them', function(assert) {
      const done = assert.async();
      assert.expect(3);

      const performer: Performer = {
        perform(task: Task): Promise<void> {
          return Promise.resolve();
        }
      };

      const serialized: Task[] = [
        {
          type: 'transform',
          data: op1
        },
        {
          type: 'transform',
          data: op2
        }
      ];

      let queue;
      bucket.setItem('queue', serialized)
        .then(() => {
          queue = new TaskQueue(performer, { name: 'queue', bucket });
          return queue.reified;
        })
        .then(() => {
          assert.equal(queue.length, 2, 'queue has two tasks');

          queue.on('complete', function() {
            assert.ok(true, 'queue completed');

            bucket.getItem('queue')
              .then(serialized => {
                assert.deepEqual(serialized, [], 'no serialized ops remain');
                done();
              });
          });
        });
    });

    test('#push - tasks pushed to a queue are persisted to its bucket', function(assert) {
      const done = assert.async();
      assert.expect(9);

      const performer: Performer = {
        perform(task: Task): Promise<void> {
          return Promise.resolve();
        }
      };

      const queue = new TaskQueue(performer, { name: 'queue', bucket });

      let transformCount = 0;

      queue.on('beforeTask', function(task) {
        transformCount++;

        if (transformCount === 1) {
          assert.strictEqual(task.data, op1, 'op1 processed');
          bucket.getItem('queue')
            .then(serialized => {
              assert.equal(serialized.length, 2);
              assert.deepEqual(serialized[0].data, op1)
              assert.deepEqual(serialized[1].data, op2)
            });
        } else if (transformCount === 2) {
          assert.strictEqual(task.data, op2, 'op2 processed');
          bucket.getItem('queue')
            .then(serialized => {
              assert.equal(serialized.length, 1);
              assert.deepEqual(serialized[0].data, op2)
            });
        }
      });

      queue.on('complete', function() {
        assert.ok(true, 'queue completed');

        bucket.getItem('queue')
          .then(serialized => {
            assert.deepEqual(serialized, [], 'no serialized ops remain');
            done();
          });
      });

      queue.push({
        type: 'transform',
        data: op1
      });

      queue.push({
        type: 'transform',
        data: op2
      });
    });
  });
});
