-- APIからの新旧の呼び名更新が逆順に届いても巻き戻さない。
CREATE TABLE member_account_name_revisions (
  user_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL
);

-- 選択していない旧Google名を現在の参加者表示に残さない。
-- 明示的な旧ルーム呼び名と、保存済み成果・履歴は変更しない。
UPDATE members SET name = '参加者 ' || UPPER(SUBSTR(user_id, 1, 6))
WHERE NOT EXISTS (SELECT 1 FROM member_display_names WHERE user_id = members.user_id)
AND EXISTS (SELECT 1 FROM room_state WHERE id=1 AND outcome_published=0);
UPDATE sharing_state SET state_json = json_set(state_json, '$.order', json((
  SELECT json_group_array(json_set(value, '$.name', COALESCE(
    (SELECT name FROM member_display_names WHERE user_id = json_extract(value, '$.userId')),
    '参加者 ' || UPPER(SUBSTR(json_extract(value, '$.userId'), 1, 6))
  ))) FROM json_each(state_json, '$.order')
))) WHERE EXISTS (SELECT 1 FROM room_state WHERE id=1 AND outcome_published=0);
