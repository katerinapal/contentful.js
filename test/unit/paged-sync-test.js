import test from 'blue-tape';
import cloneDeep from 'lodash/cloneDeep';
import sinon from 'sinon';

import { entryMock, assetMock } from './mocks';
import pagedSync from '../../lib/paged-sync';

function createEntry(id, deleted) {
  const entry = cloneDeep(entryMock);
  entry.sys.id = id;
  if (deleted) {
    entry.sys.type = 'Deleted' + entry.sys.type;
  }
  return entry;
}

function createAsset(id, deleted) {
  const asset = cloneDeep(assetMock);
  asset.sys.id = id;
  if (deleted) {
    asset.sys.type = 'Deleted' + asset.sys.type;
  }
  return asset;
}

test('Throws with no parameters', t => {
  t.plan(1);
  const http = { get: sinon.stub() };
  t.throws(() => {
    pagedSync(http, {}, { resolveLinks: true });
  }, /initial.*nextSyncToken/);
});

test('Throws with incompatible content_type and type parameter', t => {
  t.plan(1);
  const http = { get: sinon.stub() };
  t.throws(() => {
    pagedSync(http, {
      initial: true,
      content_type: 'id',
      type: 'ContentType'
    }, { resolveLinks: true });
  }, /content_type.*type.*Entry/);
});

test('Initial sync with one page', t => {
  return Promise.resolve().then(function () {
    t.plan(11);
    const http = { get: sinon.stub() };
    const entryWithLink = createEntry('1');
    entryWithLink.fields.linked = {
      sys: {
        id: '2',
        type: 'Link',
        linkType: 'Entry'
      }
    };
    http.get.withArgs('sync', { params: { initial: true } }).returns(Promise.resolve({
      data: {
        items: [entryWithLink, createEntry('2'), createEntry('3'), createEntry('3', true), createEntry('3', true), createAsset('1'), createAsset('2'), createAsset('3'), createAsset('3', true)],
        nextSyncUrl: 'http://nextsyncurl?sync_token=nextsynctoken'
      }
    }));

    return pagedSync(http, { initial: true }, { resolveLinks: true });
  }).then(function (_resp) {
    const response = _resp;

    return (response => {
      t.ok(http.get.args[0][1].params.initial, 'http request has initial param');
      t.equal(response.entries.length, 3, 'entries length');
      t.ok(response.entries[0].toPlainObject, 'toPlainObject on entry');
      t.equal(response.deletedEntries.length, 2, 'deleted entries length');
      t.ok(response.deletedEntries[0].toPlainObject, 'toPlainObject on deletedEntry');
      t.equal(response.assets.length, 3, 'entries length');
      t.ok(response.assets[0].toPlainObject, 'toPlainObject on asset');
      t.equal(response.deletedAssets.length, 1, 'deleted assets length');
      t.ok(response.deletedAssets[0].toPlainObject, 'toPlainObject on deletedAsset');
      t.equal(response.nextSyncToken, 'nextsynctoken', 'next sync token');
      t.equal(response.entries[0].fields.linked.sys.type, 'Entry', 'linked entry is resolved');
    })(response);
  });
});

test('Initial sync with one page and filter', t => {
  return Promise.resolve().then(function () {
    t.plan(5);
    const http = { get: sinon.stub() };
    http.get.withArgs('sync', { params: {
        initial: true,
        content_type: 'cat',
        type: 'Entry'
      } }).returns(Promise.resolve({
      data: {
        items: [createEntry('1'), createEntry('2'), createEntry('3')],
        nextSyncUrl: 'http://nextsyncurl?sync_token=nextsynctoken'
      }
    }));

    return pagedSync(http, { initial: true, content_type: 'cat' }, { resolveLinks: true });
  }).then(function (_resp) {
    const response = _resp;

    return (response => {
      t.ok(http.get.args[0][1].params.initial, 'http request has initial param');
      t.equal(http.get.args[0][1].params.content_type, 'cat', 'http request has content type filter param');
      t.equal(http.get.args[0][1].params.type, 'Entry', 'http request has entity type filter param');
      t.equal(response.entries.length, 3, 'entries length');
      t.equal(response.nextSyncToken, 'nextsynctoken', 'next sync token');
    })(response);
  });
});

test('Initial sync with multiple pages', t => {
  return Promise.resolve().then(function () {
    t.plan(12);
    const http = { get: sinon.stub() };
    http.get.withArgs('sync', { params: { initial: true, type: 'Entries' } }).returns(Promise.resolve({
      data: {
        items: [createEntry('1'), createEntry('2')],
        nextPageUrl: 'http://nextsyncurl?sync_token=nextpage1'
      }
    }));

    http.get.withArgs('sync', { params: { sync_token: 'nextpage1' } }).returns(Promise.resolve({
      data: {
        items: [createEntry('3'), createEntry('3', true), createEntry('3', true), createAsset('1')],
        nextPageUrl: 'http://nextsyncurl?sync_token=nextpage2'
      }
    }));

    http.get.withArgs('sync', { params: { sync_token: 'nextpage2' } }).returns(Promise.resolve({
      data: {
        items: [createAsset('2'), createAsset('3'), createAsset('3', true)],
        nextSyncUrl: 'http://nextsyncurl?sync_token=nextsynctoken'
      }
    }));

    return pagedSync(http, { initial: true, type: 'Entries' }, { resolveLinks: true });
  }).then(function (_resp) {
    const response = _resp;

    return (response => {
      return function () {
        const objResponse = response.toPlainObject();
        t.ok(http.get.args[0][1].params.initial, 'http request has initial param');
        t.equal(http.get.args[0][1].params.type, 'Entries', 'http request has type param');
        t.notOk(http.get.args[1][1].params.initial, 'second http request does not have initial param');
        t.notOk(http.get.args[1][1].params.type, 'second http request does not have type param');
        t.equal(http.get.args[1][1].params.sync_token, 'nextpage1', 'http request param for first page');
        t.equal(http.get.args[2][1].params.sync_token, 'nextpage2', 'http request param for second page');
        t.equal(objResponse.entries.length, 3, 'entries length');
        t.equal(objResponse.deletedEntries.length, 2, 'deleted entries length');
        t.equal(objResponse.assets.length, 3, 'entries length');
        t.equal(objResponse.deletedAssets.length, 1, 'deleted assets length');
        t.equal(objResponse.nextSyncToken, 'nextsynctoken', 'next sync token');
        t.ok(response.stringifySafe(), 'stringifies response');
      }();
    })(response);
  });
});

test('Sync with existing token', t => {
  return Promise.resolve().then(function () {
    t.plan(6);
    const http = { get: sinon.stub() };
    http.get.withArgs('sync', { params: { sync_token: 'nextsynctoken' } }).returns(Promise.resolve({
      data: {
        items: [createEntry('1'), createEntry('3', true), createAsset('1'), createAsset('3', true)],
        nextSyncUrl: 'http://nextsyncurl?sync_token=nextsynctoken'
      }
    }));

    return pagedSync(http, { nextSyncToken: 'nextsynctoken' }, { resolveLinks: true });
  }).then(function (_resp) {
    const response = _resp;

    return (response => {
      t.equal(http.get.args[0][1].params.sync_token, 'nextsynctoken', 'http request param for sync');
      t.equal(response.entries.length, 1, 'entries length');
      t.equal(response.deletedEntries.length, 1, 'deleted entries length');
      t.equal(response.assets.length, 1, 'entries length');
      t.equal(response.deletedAssets.length, 1, 'deleted assets length');
      t.equal(response.nextSyncToken, 'nextsynctoken', 'next sync token');
    })(response);
  });
});

test('Initial sync with multiple pages but pagination disabled', t => {
  return Promise.resolve().then(function () {
    t.plan(18);

    const http = { get: sinon.stub() };
    http.get.withArgs('sync', { params: { initial: true, type: 'Entries' } }).returns(Promise.resolve({
      data: {
        items: [createEntry('1'), createEntry('2')],
        nextPageUrl: 'http://nextsyncurl?sync_token=nextpage1'
      }
    }));

    http.get.withArgs('sync', { params: { sync_token: 'nextpage1' } }).returns(Promise.resolve({
      data: {
        items: [createEntry('3'), createEntry('3', true), createEntry('3', true), createAsset('1')],
        nextPageUrl: 'http://nextsyncurl?sync_token=nextpage2'
      }
    }));

    http.get.withArgs('sync', { params: { sync_token: 'nextpage2' } }).returns(Promise.resolve({
      data: {
        items: [createAsset('2'), createAsset('3'), createAsset('3', true)],
        nextSyncUrl: 'http://nextsyncurl?sync_token=nextsynctoken'
      }
    }));

    return pagedSync(http, { initial: true, type: 'Entries' }, { paginate: false });
  }).then(function (_resp) {
    const response = _resp;

    return (response => {
      return function () {
        const objResponse = response.toPlainObject();
        t.equal(http.get.callCount, 1, 'only one request was sent');
        t.ok(http.get.args[0][1].params.initial, 'http request has initial param');
        t.equal(http.get.args[0][1].params.type, 'Entries', 'http request has type param');
        t.equal(objResponse.entries.length, 2, 'entries length');
        t.equal(objResponse.deletedEntries.length, 0, 'deleted entries length');
        t.equal(objResponse.assets.length, 0, 'entries length');
        t.equal(objResponse.deletedAssets.length, 0, 'deleted assets length');
        t.equal(objResponse.nextPageToken, 'nextpage1', 'next page token');
        t.notOk(objResponse.nextSyncToken, 'next sync token should not exist');
        t.ok(response.stringifySafe(), 'stringifies response');

        // Manually sync next page
        return pagedSync(http, { nextPageToken: objResponse.nextPageToken }, { paginate: false });
      }();
    })(response);
  }).then(function (_resp) {
    const generated_var_2 = _resp;

    return (generated_var_2 => {
      return function () {
        const objResponse = generated_var_2.toPlainObject();
        t.equal(http.get.callCount, 2, 'second request was sent and no pagination happened');
        t.notOk(http.get.args[1][1].params.initial, 'http request does not have initial param');
        t.equal(objResponse.nextPageToken, 'nextpage2', 'next page token');
        t.notOk(objResponse.nextSyncToken, 'next sync token should not exist');

        // Manually sync next (last) page
        return pagedSync(http, { nextPageToken: objResponse.nextPageToken }, { paginate: false });
      }();
    })(generated_var_2);
  }).then(function (_resp) {
    const generated_var_3 = _resp;

    return (generated_var_3 => {
      return function () {
        const objResponse = generated_var_3.toPlainObject();
        t.equal(http.get.callCount, 3, 'third request was sent and no pagination happened');
        t.notOk(http.get.args[2][1].params.initial, 'http request does not have initial param');
        t.notOk(objResponse.nextPageToken, 'next page token should not exist');
        t.equal(objResponse.nextSyncToken, 'nextsynctoken', 'next sync token');
      }();
    })(generated_var_3);
  });
});
