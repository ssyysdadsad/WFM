import { createClient } from 'npm:@supabase/supabase-js@2';

type PublishPayload = {
  schedule_version_id?: string;
  operator_user_account_id?: string;
  create_announcement?: boolean;
  announcement_title?: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length).trim();
}

async function resolveOperatorUserAccountId(
  supabase: ReturnType<typeof createClient>,
  request: Request,
  fallbackOperatorUserAccountId?: string,
) {
  const accessToken = getBearerToken(request);

  if (accessToken) {
    const { data: authUserData, error: authUserError } = await supabase.auth.getUser(accessToken);
    if (authUserError) {
      throw new Error(authUserError.message || '获取当前登录用户失败');
    }

    const authUserId = authUserData.user?.id;
    if (authUserId) {
      const { data: userAccount, error: accountError } = await supabase
        .from('user_account')
        .select('id')
        .eq('auth_user_id', authUserId)
        .eq('is_enabled', true)
        .maybeSingle();

      if (accountError) {
        throw new Error(accountError.message || '加载操作者账号失败');
      }

      if (userAccount?.id) {
        return userAccount.id;
      }
    }
  }

  if (fallbackOperatorUserAccountId) {
    return fallbackOperatorUserAccountId;
  }

  throw new Error('未解析到当前操作者账号');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = (await request.json()) as PublishPayload;

    if (!payload.schedule_version_id) {
      return Response.json(
        {
          success: false,
          error_code: 'VALIDATION_FAILED',
          message: 'schedule_version_id 为必填字段',
        },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        {
          success: false,
          error_code: 'SERVER_CONFIG_MISSING',
          message: '缺少 Supabase 服务端配置',
        },
        { status: 500, headers: corsHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const operatorUserAccountId = await resolveOperatorUserAccountId(
      supabase,
      request,
      payload.operator_user_account_id,
    );

    const { data: scheduleVersion, error: loadError } = await supabase
      .from('schedule_version')
      .select('*')
      .eq('id', payload.schedule_version_id)
      .maybeSingle();

    if (loadError || !scheduleVersion) {
      return Response.json(
        {
          success: false,
          error_code: 'SCHEDULE_VERSION_NOT_FOUND',
          message: '未找到对应排班版本',
        },
        { status: 404, headers: corsHeaders },
      );
    }

    if (scheduleVersion.published_at) {
      return Response.json(
        {
          success: false,
          error_code: 'SCHEDULE_VERSION_ALREADY_PUBLISHED',
          message: '该排班版本已发布，禁止重复发布',
        },
        { status: 409, headers: corsHeaders },
      );
    }

    const { data: dictItems } = await supabase
      .from('dict_item')
      .select('id, item_code')
      .in('item_code', ['published', 'draft']);

    const publishedStatus = dictItems?.find((item) => item.item_code === 'published');

    if (!publishedStatus) {
      return Response.json(
        {
          success: false,
          error_code: 'DICT_STATUS_MISSING',
          message: '缺少 published 发布状态字典项',
        },
        { status: 400, headers: corsHeaders },
      );
    }

    const publishedAt = new Date().toISOString();
    const { error: publishError } = await supabase
      .from('schedule_version')
      .update({
        publish_status_dict_item_id: publishedStatus.id,
        published_at: publishedAt,
        published_by_user_account_id: operatorUserAccountId,
      })
      .eq('id', payload.schedule_version_id);

    if (publishError) {
      return Response.json(
        {
          success: false,
          error_code: publishError.code ?? 'SCHEDULE_PUBLISH_FAILED',
          message: publishError.message,
        },
        { status: 400, headers: corsHeaders },
      );
    }

    if (payload.create_announcement) {
      const { data: announcementTypes } = await supabase
        .from('dict_item')
        .select('id, item_code')
        .eq('item_code', 'schedule_publish')
        .limit(1);

      const announcementTypeId = announcementTypes?.[0]?.id;

      if (announcementTypeId) {
        await supabase.from('announcement').insert({
          title: payload.announcement_title || `${new Date(publishedAt).getMonth() + 1}月排班已发布`,
          announcement_type_dict_item_id: announcementTypeId,
          content: '排班版本已发布，请相关人员及时查看。',
          visibility_scope_type: 'all',
          visibility_scope_config: null,
          published_by_user_account_id: operatorUserAccountId,
          published_at: publishedAt,
        });
      }
    }

    return Response.json(
      {
        success: true,
        error_code: null,
        message: 'schedule published',
        data: {
          schedule_version_id: payload.schedule_version_id,
          published_at: publishedAt,
        },
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error_code: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 500, headers: corsHeaders },
    );
  }
});
