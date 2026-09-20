"use client";

import { useEffect, useRef } from "react";

export type Locale = "zh" | "en";

type LanguageToggleProps = {
  locale: Locale;
  onChange: (locale: Locale) => void;
  compact?: boolean;
};

// The workspace was originally authored in Chinese. Keeping this dictionary at the
// display boundary lets the existing forms retain their Chinese status values and
// validation logic while presenting a complete English teacher experience.
const englishText: Record<string, string> = {
  "管理端": "Admin portal",
  "收起菜单": "Close menu",
  "菜单": "Menu",
  "名单中": "On this list,",
  "位学生已在本班": "students are already in this class",
  "已进班 · 信息待核实": "Joined \u00b7 Details need checking",
  "信息待核实": "Details to check",
  "班内多出学生": "Class members not on list",
  "信息需要核实的学生": "Students whose details need checking",
  "已进本班，但不在导入名单中": "In this class but not on the uploaded list",
  "已进班且信息一致的学生": "Joined students with matching details",
  "还有信息需要核实的学生，请点击“信息待核实”查看。": "Some details still need checking. Select Details to check.",
  "这份文件已导入，但本次选择的列与上次不同。请恢复原来的选列，或修改名单文件后重新导入。": "This file was already imported with different columns. Restore the original column selection or update the file before importing.",
  "这份文件是之前使用过的名单，当前已有更新的名单。请关闭窗口查看当前名单；如需替换，请更新文件后导入。": "A newer list is now in use. Close this window to view it, or update your file before importing a replacement.",

  "已进本班": "Joined this class",
  "未进本班": "Not in this class",
  "不在导入名单中": "Not on the uploaded list",
  "加入了其他班": "Joined another class",
  "学号重复": "Duplicate student number",
  "请选择学号所在的列。": "Select the student number column.",
  "请选择姓名所在的列。": "Select the name column.",
  "登录已过期，请重新登录。": "Your session expired. Please sign in again.",
  "你暂时没有检查这个班级名单的权限。": "You do not have permission to check this class.",
  "请检查学号、姓名对应的列，以及名单中的数据是否完整。": "Check the selected name and student number columns and complete any missing information.",
  "名单中有无法识别的信息，请检查学号、姓名和选择的列后重试。": "Some information could not be read. Check student numbers, names and selected columns, then retry.",
  "名单已保存，但进班检查尚未完成。请重试检查，无需重新选择文件。": "Your list was saved, but the class check is incomplete. Retry without selecting the file again.",
  "名单已有更新，请刷新后再检查。": "The list has changed. Refresh before checking again.",
  "暂时未能完成操作，请稍后重试。": "Unable to complete this action. Please try again shortly.",
  "进班情况已更新（演示数据）。": "Class membership updated (demo).",
  "进班情况已更新。": "Class membership updated.",
  "已保存核实情况（演示数据）。": "Review saved (demo).",
  "已记录核实情况。": "Review saved.",
  "已标记为需要重新核实。": "Marked for another review.",
  "进班情况已有更新，请关闭详情并重新检查。": "Class membership has changed. Close the details and check again.",
  "暂时无法查看进班情况，请重试。": "Unable to load class membership. Please retry.",
  "导入名单，选好学号和姓名所在的列，即可查看哪些学生还没进本班。": "Upload your list and select the student number and name columns to see who has not joined this class.",
  "当前为演示数据，仅用于体验操作。": "Demo data for trying this feature.",
  "检查后可提醒未进班的学生扫码或输入邀请码加入。": "Remind missing students to join using the class QR code or invitation code.",
  "正在检查": "Checking",
  "刷新进班情况": "Refresh class membership",
  "名单与检查时间": "List and check time",
  "导入名单": "Upload list",
  "最近检查": "Last checked",
  "尚未检查，请点击刷新进班情况": "Not checked yet. Select Refresh class membership.",
  "进班情况概览": "Class membership overview",
  "已进班且信息一致": "Joined with matching details",
  "需要核实": "Needs review",
  "全部检查结果": "All results",
  "进班情况": "Class membership",
  "还未进本班的学生": "Students not in this class",
  "需要核实的学生": "Students needing review",
  "学生进班情况": "Student class membership",
  "名单已保存，点击“刷新进班情况”开始检查。": "List saved. Select Refresh class membership to check.",
  "尚未检查进班情况": "Class membership has not been checked",
  "没有找到这位学生": "No matching student found",
  "未发现尚未进本班的学生": "No students found missing from this class",
  "没有需要显示的学生": "No students to display",
  "请点击上方“刷新进班情况”。": "Select Refresh class membership above.",
  "还有需要核实的学生，请点击“需要核实”查看。": "Some students still need review. Select Needs review to see them.",
  "可切换上方分类查看其他学生。": "Select another group above to view other students.",
  "说明与建议": "Details and next steps",
  "课程管理 · 检查学生进班": "Class Management \u00b7 Check Class Membership",
  "检查学生进班": "Check class membership",
  "正在查看进班情况": "Loading class membership",
  "正在读取名单和最近的检查结果。": "Loading your list and the latest check results.",
  "暂时无法查看进班情况": "Unable to load class membership",
  "暂时未能保存，请稍后重试。": "Unable to save. Please try again shortly.",
  "学生信息与核实记录": "Student details and review notes",
  "进班情况说明": "Class membership details",
  "需要核实的信息": "Information to review",
  "学号、姓名等信息没有发现差异。": "No differences found in student numbers, names or other details.",
  "最近核实说明": "Latest review note",
  "请填写核实情况，例如已联系学生重新加入本班。": "Describe your review, for example that you contacted the student to join this class.",
  "请先修正下方提示的问题，再检查进班情况。": "Fix the issues below before checking class membership.",
  "导入名单 · 第": "Upload list \u00b7 Step",
  "步，共 2 步": "of 2",
  "1 选择名单": "1 Choose a list",
  "2 确认各列后检查": "2 Select columns and check",
  "支持 .xlsx、.xls 和 .csv，最大 100 MB、最多 500 行。学号始终按字符串处理。": "Supports .xlsx, .xls and .csv, up to 100 MB and 500 rows. Leading zeroes in student numbers are preserved.",
  "行，请确认姓名和学号是否正确。": "rows. Check that names and student numbers are correct.",
  "这些信息分别在哪一列？": "Which columns contain these details?",
  "已帮你选择常见表头。请确认学号和姓名对应的列，其他信息可不选。": "Common headers are selected for you. Confirm the student number and name columns; the others are optional.",
  "请选择对应的列": "Select a column",
  "不使用这一列": "Skip this field",
  "将使用这份名单重新检查进班情况，之前导入的名单仍会保留。": "This list will be used for the new check. Previous lists are retained.",
  "点击下方按钮后，会按学号检查谁还没进本班。学生仍需自行扫码或输入邀请码加入。": "Check who has not joined using student numbers. Students still join using the class QR code or invitation code.",
  "请检查名单中的这些信息": "Review these details in the list",
  "缺少或格式不正确的信息需要修正；重复学号会在“需要核实”中提示。": "Fix missing or invalid details. Duplicate student numbers will appear under Needs review.",
  "条提示。": "more notes.",
  "正在检查进班情况…": "Checking class membership\u2026",
  "检查谁还没进班": "Check who has not joined",
  "已加入本班，名单信息一致。": "Joined this class with matching details.",
  "还未加入本班，请提醒学生使用本班邀请码或二维码加入。": "Not in this class yet. Remind the student to use this class invitation code or QR code.",
  "已加入本班，但不在导入名单中，请核实是否选了这门课。": "Joined this class but is not on the uploaded list. Verify their course selection.",
  "目前加入了其他班级，请联系学生核实选课情况。": "Currently in another class. Contact the student to check their course selection.",
  "学号相同，但姓名、性别或入学年份不同，请核实学生信息。": "The student number matches, but the name, gender or admission year differs. Verify their details.",
  "同一学号出现多次，请先核实重复的学生信息。": "The same student number appears more than once. Review the duplicate details.",

  "AI 初审筛选": "Filter AI advice",
  "全部 AI 结果": "All AI results",
  "建议通过": "Suggested approval",
  "需要教师复核": "Teacher review needed",
  "疑似异常/违规": "Potential issue or violation",
  "等待或暂不可用": "Pending or unavailable",
  "等待初审 / 暂不可用": "Pending or unavailable",
  "刷新 AI 结果": "Refresh AI results",
  "AI 初审建议": "AI review advice",
  "AI 初审仅提供建议与风险标记，由责任教师作出最终决定；退回补证和判无效需选择公开原因。": "AI provides advice and risk flags. The responsible teacher makes the final decision; returning evidence or rejecting a record requires a public reason.",
  "内容安全风险": "Content safety risk",
  "未发现明确运动行为": "No clear exercise observed",
  "运动项目可能不符": "Possible sport mismatch",
  "发现相同材料，需核实是否重复使用": "Identical evidence found; check whether it was reused",
  "材料疑似相似": "Potentially similar evidence",
  "证据不足或模型无法确认": "Insufficient evidence or uncertain model assessment",
  "视频仅抽帧检查，未覆盖音频与间隔画面": "Video frames were sampled; audio and intervening frames were not checked",
  "AI 初审暂不可用，请人工审核": "AI advice unavailable; please review manually",
  "AI 正在初审，可先人工审核": "AI review in progress; manual review is available",
  "AI 等待初审，可先人工审核": "AI review queued; manual review is available",
  "暂无 AI 初审结果": "No AI advice available",
  "需要人工核实": "Manual verification needed",
  "AI 结果仅供参考，可能存在误判。最终由教师确认，疑似重复不等同于作弊。": "AI advice may be incorrect. Teachers decide; suspected duplication does not prove cheating.",
  "AI 可自动通过或判无效，教师可复核修改。无法确认、疑似重复及抽帧视频交教师审核，请以记录审核结果为准。": "AI may approve or reject automatically; teachers can review and correct. Uncertain, duplicate or sampled video evidence requires teacher review. Refer to the record's review result.",
  "以上内容为AI生成，不代表开发者立场，请勿删除或修改本标记": "The above content is AI-generated and does not represent the developer's views. Please retain this notice.",
  "材料版本": "Evidence version",
  "修改课程名称": "Rename course",
  "课程名称已保存。": "Course name saved.",
  "重试保存名称": "Retry saving name",
  "保存课程名称": "Save course name",
  "历史补卡范围已保存。": "Historical exercise dates saved.",
  "历史补卡设置": "Historical exercise settings",
  "历史补卡": "Historical exercise",
  "允许学生补交过去完成的运动，提交凭证后仍须你审核。": "Allow students to submit past exercise with evidence for your review.",
  "已开启": "Enabled",
  "未开启": "Disabled",
  "允许学生补卡": "Allow historical exercise submissions",
  "学生可在下方日期范围内选择历史运动。": "Students can select past exercise within the dates below.",
  "当前不接受新的历史补卡，开启后设置允许日期。": "New historical submissions are disabled. Enable them and choose the allowed dates.",
  "最早可补日期": "Earliest exercise date",
  "最晚可补日期": "Latest exercise date",
  "可包含入班前的运动，但不能补今天或未来日期。补卡须在常规提交截止前提交，按实际运动日期计算每日、每周次数。": "Exercise before enrollment is allowed, but today's and future dates are excluded. Submit before the regular deadline. Daily and weekly limits use the actual exercise date.",
  "修改后请保存，学生端才会生效。": "Save changes to apply them to students.",
  "保存补卡设置": "Save historical exercise settings",
  "删除请求恢复记录异常，请联系管理员核查。": "The saved removal request could not be restored. Contact an administrator.",
  "请填写删除原因并确认业务影响。": "Enter a reason and confirm the effects of removal.",
  "课程已移出当前列表，学生账号和全部历史记录已保留。": "Course removed from the current list. Student accounts and all history are retained.",
  "删除课程": "Remove course",
  "结束本课程及在课关系，保留学生账号、邮箱绑定、运动记录、审核、学时及照片视频。学生仍可查看本人历史。": "End this course and its enrollments. Retain student accounts, verified emails, exercise records, reviews, credited hours and media. Students can still view their history.",
  "再次确认删除范围": "Confirm the removal scope",
  "仅删除「": "Only end enrollments for “",
  "」的当前课程关系。学生账号、全部历史及其他课程数据保留；没有班级的学生可重新扫码或输入邀请码进班。": "”. Student accounts, all history and other courses are retained. Students without a class can join using a QR code or invitation code.",
  "输入完整课程名称确认": "Enter the full course name to confirm",
  "删除原因": "Reason for removal",
  "我确认上述影响范围，并确认保留学生账号和全部历史": "I confirm the effects above and retention of student accounts and all history",
  "上次删除结果待确认，将按原请求重试。": "The previous removal is unconfirmed. The original request will be retried.",
  "重试原删除请求": "Retry original removal",
  "确认删除课程": "Confirm course removal",
  "尚未结束的运动": "Unfinished exercise sessions",
  "未提交记录": "Unsubmitted records",
  "待补充材料": "Evidence awaiting resubmission",
  "技术复核": "Technical review",
  "材料处理中": "Evidence processing",
  "尚未结束的平台中断": "Ongoing platform interruptions",
  "待处理申请": "Pending applications",
  "名单处理中": "Roster processing",
  "名单核对处理中": "Roster reconciliation in progress",
  "体测导入待确认": "Physical test imports awaiting confirmation",
  "待处理名单差异": "Unresolved roster differences",
  "识别草稿待确认": "OCR drafts awaiting confirmation",
  "当前正式名单": "Current official roster",
  "正式名单确认": "Official roster confirmation",
  "名单身份冲突": "Roster identity conflicts",
  "名单注册入班核对": "Registration and enrollment reconciliation",
  "原始体测资料": "Original physical test data",
  "课程规则发布": "Course rule publication",
  "结算时间": "Settlement time",
  "综合名单结算确认": "Combined roster settlement confirmation",
  "已注册入班": "Registered and enrolled",
  "待注册或入班": "Awaiting registration or enrollment",
  "身份冲突": "Identity conflict",
  "名单外已入班": "Enrolled outside the roster",
  "请学生结束尚在进行的运动。": "Ask students to finish ongoing exercise sessions.",
  "请提醒学生完成凭证上传并提交打卡。": "Remind students to upload evidence and submit their records.",
  "到“打卡审核”处理待审核记录。": "Open Check-in review to process pending records.",
  "等待学生补交材料，并完成审核。": "Wait for supplementary evidence, then review it.",
  "请处理技术复核记录。": "Resolve records awaiting technical review.",
  "凭证正在处理，完成后重新检查。": "Evidence is processing. Check again when it finishes.",
  "请管理员确认平台中断已结束。": "Ask an administrator to confirm the interruption has ended.",
  "请审核免测、免打卡及运动抵扣申请。": "Review test exemption, check-in exemption and exercise credit applications.",
  "到“名单对齐”导入本课程正式名单。": "Open Roster reconciliation to import the official course roster.",
  "在“名单对齐”核对并确认正式名单。": "Check and confirm the official roster in Roster reconciliation.",
  "在名单中处理重复身份或匹配冲突。": "Resolve duplicate identities or matching conflicts in the roster.",
  "核对正式名单中的学生是否完成注册入班。": "Check whether students on the official roster have registered and enrolled.",
  "请核对并确认本课程原始体测资料。": "Check and confirm this course's original physical test data.",
  "到课程设定的结算时间后才能结算。": "Settlement becomes available at the scheduled course settlement time.",
  "待名单和资料齐备后，在下方核对综合名单并勾选确认。": "Once the roster and data are ready, review the combined roster below and confirm.",
  "等待名单处理完成。": "Wait for roster processing to finish.",
  "等待名单对齐完成。": "Wait for roster reconciliation to finish.",
  "请确认已导入的体测结果。": "Confirm the imported physical test results.",
  "到“名单对齐”处理未确认的差异。": "Resolve unconfirmed differences in Roster reconciliation.",
  "请核对并确认表格识别草稿。": "Check and confirm the table recognition drafts.",
  "请先保存并发布课程规则。": "Save and publish the course rules first.",
  "结算重试记录损坏，请联系管理员核查请求结果。": "The saved settlement request is invalid. Ask an administrator to check its result.",
  "导出文件格式异常，请重试。": "The exported file has an unexpected format. Try again.",
  "已生成实时综合名单下载（未结算）。": "The current combined roster is ready to download (not settled).",
  "课程结算": "Course settlement",
  "课程名单与结算": "Course roster and settlement",
  "先核对学生名单、处理待办，再保存本课程最终结算结果。需要当前名单时，可单独导出。": "Check the roster and resolve pending items before saving the final settlement. You can export the current roster separately.",
  "当前状态不支持该操作。": "This action is unavailable in the current state.",
  "结算条件尚未全部满足，请先处理下方待办。": "Settlement requirements are not yet met. Resolve the items below first.",
  "检查结算条件": "Check settlement requirements",
  "导出实时综合名单": "Export current combined roster",
  "已满足结算条件": "Ready for settlement",
  "还不能结算": "Not ready for settlement",
  "项需要处理或确认；已完成": "items need attention or confirmation; completed:",
  "项。": "items.",
  "需要你关注": "Needs your attention",
  "请完成此项后重新检查。": "Complete this item and check again.",
  "待处理": "Pending",
  "查看已通过的检查（": "View passed checks (",
  "正式名单": "Official roster",
  "人；注册入班核对": "students; registration and enrollment check:",
  "未完成": "Incomplete",
  "。预检时间：": ". Checked at:",
  "名单状态": "Roster status",
  "待办": "Pending items",
  "我已核对综合名单，确认保存结算快照": "I have checked the combined roster and confirm saving the settlement snapshot",
  "重试并查询结算结果": "Retry and check settlement result",
  "确认课程结算": "Confirm course settlement",
  "已保存的结算报告": "Saved settlement reports",
  "暂无已保存报告。": "No saved reports yet.",
  "初版": "Initial version",
  "下载结算报告 v": "Download settlement report v",
  "加载更早报告": "Load older reports",
  "当前课程不可修改，请刷新后重试。": "This course cannot be edited. Refresh and try again.",
  "上次保存结果尚未确认，请先按原内容重试并核对结果。": "The previous save is unconfirmed. Retry the same changes and check the result.",
  "保存后的课程设置与提交内容不一致，请重试并核对结果。": "The saved settings do not match your changes. Retry and check the result.",
  "每日时间、打卡状态和课程规则已保存，已有运动记录保留原计时规则。": "Daily hours, check-in availability and course rules saved. Existing records retain their original timing rules.",
  "课程设置未全部确认保存。每日时间可能已保存，请核对后重试。": "Some course settings could not be confirmed. Daily hours may have been saved. Check the settings before retrying.",
  "调整课程目标、运动规则、每日时间和打卡状态。": "Adjust course targets, exercise rules, daily hours and check-in availability.",
  "课程已发布，可修改每日时间和打卡状态；打卡日期及截止日期已锁定。": "The course is published. Daily hours and check-in availability can be changed; start, end and submission deadline dates are locked.",
  "天": "Days",
  "BNBU Sports 教师与管理端｜体育课程管理": "BNBU Sports Teacher and Admin Portal | Physical Education",
  "北师香港浸会大学体育课程管理入口。教师管理课程、学生名单与运动记录；管理员管理学生账户、学期和平台规则。": "BNBU physical education portal. Teachers manage courses, rosters and exercise records; administrators manage student accounts, semesters and platform rules.",
  "BNBU Sports 教师与管理端": "BNBU Sports Teacher and Admin Portal",
  "体育课程、学生名单、运动记录与学期管理。": "Physical education courses, student rosters, exercise records and semester management.",
  "规则已保存，分类目标已应用于本课程学生；已有运动记录保留原计时规则。": "Rules saved and category targets applied to course students. Existing exercise records retain their original timing rules.",
  "课程规则以服务端已发布版本为准。调整分类目标将更新本课程学生的进度与成绩，已有运动记录保留原计时规则。": "Published server rules apply. Changing category targets updates student progress and grades; existing exercise records retain their original timing rules.",
  "请填写非负整数天、小时、分钟，总时长至少 1 分钟，且不得超过学期结束。": "Enter nonnegative whole days, hours and minutes. Total duration must be at least 1 minute and end within the semester.",
  "邀请有效期由教师自定义，至少 1 分钟，截止时间不得超过学期结束。到期前已登记的学生可在到期后 10 分钟内完成入班，重复操作不会延长截止时间。": "Teachers choose a duration of at least 1 minute, ending within the semester. Students registered before expiry have 10 minutes afterwards to complete joining; repeated actions do not extend that deadline.",
  "默认 30 分钟，可组合天、小时、分钟，总时长至少 1 分钟，截止时间不得超过学期结束。到期后不再接受新登记；已登记流程的截止时间固定为邀请到期后 10 分钟。": "Default: 30 minutes. Combine days, hours and minutes, totaling at least 1 minute and ending within the semester. New registration stops at expiry; existing registrations have a fixed deadline 10 minutes afterwards.",
  "邀请有效期由教师自定义，至少 5 分钟，截止时间不得超过学期结束。到期前已登记的学生可在到期后 10 分钟内完成入班，重复操作不会延长截止时间。": "Teachers choose invitation duration, at least 5 minutes and ending no later than semester end. Students registered before expiry can finish joining within 10 minutes after expiry. Repeated actions do not extend the deadline.",
  "默认 30 分钟，可自定义为至少 5 分钟，截止时间不得超过学期结束。到期后不再接受新登记；已登记流程的截止时间固定为邀请到期后 10 分钟。": "The default is 30 minutes. Choose at least 5 minutes, ending no later than semester end. New registrations stop at expiry; existing registrations have a fixed deadline 10 minutes after invitation expiry.",
  "使用当前密码验证并设置新密码": "Verify your current password and set a new password",
  "课程目标尚未加载，请稍后重试。": "The course target has not loaded. Please try again shortly.",
  "填写并核对学生的最终成绩，保存后再统一发布到内部成绩册。": "Enter and check final grades, save them, then publish them to the internal gradebook.",
  "内部成绩仅供教师管理，不向学生展示或推送。": "Internal grades are for teacher management and are not shown or sent to students.",
  "当前筛选没有成绩记录": "No grade records match this filter",
  "请切换筛选条件，或先为学生录入最终成绩。": "Change the filters or enter a final grade for a student.",
  "正在读取课程总目标。": "Loading the total course target.",
  "课程规则以服务端已发布版本为准。": "The published course rules apply.",
  "读取中": "Loading",
  "成绩与体测": "Grades and physical test",
  "先填写内部最终成绩；需要补充体测时，在下方录入或导入原始资料。": "Enter the internal final grade first. Add physical test data below if needed.",
  "正在保存…": "Saving…",
  "保存最终成绩": "Save final grade",
  "该成绩已发布，修改后会保留历史版本；内部成绩不向学生展示或推送。": "This grade is published. Changes retain its history; internal grades are not shown or sent to students.",
  "内部最终成绩": "Internal final grade",
  "填写你核定的整数分数。下方体测资料不会自动改写最终成绩。": "Enter the whole-number grade you have determined. Physical test data below does not automatically change it.",
  "最终成绩（分）": "Final grade (points)",

  "（必填）": "(required)",
  "历史补录 · 必须人工审核": "Historical entry · Teacher review required",
  "单次最多运动时间须为整数分钟，不低于最低时长且不超过 1440 分钟。": "The session limit must be a whole number of minutes, at least the minimum duration and no more than 1,440 minutes.",
  "每天最多次数必须为正整数。": "The daily limit must be a positive whole number.",
  "最低运动时长须为 1–1440 分钟，每周次数须为正整数。": "The minimum duration must be 1–1,440 minutes and the weekly limit must be a positive whole number.",
  "规则已保存，单次上限应用于之后新开始的打卡。": "Rules saved. The session limit applies to sessions started from now on.",
  "两类认可量须为非负数并精确到整分钟，且不超过课程相应目标。": "Recognition for each category must be a non-negative whole number of minutes within its course target.",
  "学生名单 (": "Student roster (",
  "请点击“进入课程”，设置课程相关信息并保存发布后，再生成邀请二维码。": "Select Enter course, configure and publish the course, then generate an invitation QR code.",
  "本课程学生及其入班状态": "Course students and enrollment status",
  "入班状态": "Enrollment status",
  "在班": "Enrolled",
  "已退出": "Left course",
  "本课程暂无学生。": "This course has no students yet.",
  "总目标由总管理员设置。": "The super administrator sets the total target.",
  "总目标已变更，请重新分配两类目标；保存前学生暂停新打卡。": "The total target has changed. Redistribute the two category targets; new sessions are paused until you save.",
  "单次最多运动时间（分钟）": "Maximum session duration (minutes)",
  "达到上限自动结束，单次最多计入相同分钟数；修改仅影响新开始的打卡。": "Sessions end automatically at this limit, with the same maximum credited minutes. Changes apply to new sessions only.",
  "最低运动时长（分钟）": "Minimum exercise duration (minutes)",
  "保存后仅对新增记录生效，已有记录继续采用原规则。": "Changes apply to new records. Existing records retain their original rules.",
  "每天最多计入次数": "Maximum credited sessions per day",
  "请先设置课程日期": "Set the course dates first",
  "请先获取学期日期": "Load the semester dates first",
  "在课成员": "Current members",
  "历史成员": "Former member",
  "关闭后自动移出全部在课学生，停止新入班、新运动和新申请。关闭前合法业务继续按原期限处理，审核、补证及结算仍需完成。": "Closing removes all current members and stops new enrollments, exercise sessions and applications. Existing work continues within its original deadlines; reviews, supplements and settlement remain available.",
  "课程已关闭，全部在课学生已移出，关闭前合法业务仍可继续处理。": "Course closed and all current members removed. Previously admitted work can still be completed.",
  "等待审核服务": "Waiting for review service",
  "AI 审核功能敬请期待，请联系总管理员为本课程开启人工审核。": "AI review is coming soon. Ask the super administrator to enable manual review for this course.",
  "公开说明：": "Public comment:",
  "确认审核通过": "Confirm approval",
  "公开说明将随审核结果保存，并向该学生展示。": "The public comment is saved with the review and shown to this student.",
  "在正常和维护模式之间切换；每次变更都写入审计日志。": "Switch between normal and maintenance modes. Every change is audited.",
  "查看或切换服务端系统模式，并发布维护公告。": "View or change the system mode and publish maintenance notices.",
  "账号资料不完整，请联系管理员。": "Account details are incomplete. Contact an administrator.",
  "账号或邮箱": "Account or email",
  "请输入分配的账号或邮箱": "Enter your assigned account or email",
  "预计恢复时间：": "Estimated recovery:",
  "请留意管理员后续通知": "Watch for further administrator updates",
  "首次登录设置密码": "Set your password on first sign-in",
  "请使用当前临时密码设置个人密码，完成后进入工作台。": "Use your temporary password to set a personal password and enter the workspace.",
  "当前临时密码": "Current temporary password",
  "请输入管理员提供的临时密码": "Enter the temporary password provided by your administrator",
  "请输入当前临时密码": "Enter your current temporary password",
  "保存密码并进入工作台": "Save password and enter workspace",
  "我的通知": "My notifications",
  "当前账号的业务通知": "Updates for your account",
  "该材料缺少关联信息，请刷新后重试。": "This material is missing its reference. Refresh and try again.",
  "当前展示学生提交的原始材料，可切换上方标签逐一查看。": "These are the student's original materials. Use the tabs to inspect each item.",
  "缺少成绩版本，请刷新后重试。": "The grade version is missing. Refresh and try again.",
  "相关课程不存在或当前账号无权查看，请刷新课程后重试。": "The course is unavailable or outside your access. Refresh and try again.",
  "相关申请不在当前可查看范围内，请刷新后重试。": "The application is outside the current view. Refresh and try again.",
  "相关打卡记录不在当前可查看范围内，请刷新后重试。": "The exercise record is outside the current view. Refresh and try again.",
  "请选择模板允许的最低运动时长和每周次数。": "Select a duration threshold and weekly limit allowed by the template.",
  "打卡日期必须位于当前学期内，请修改起止日期。": "Check-in dates must fall within the current semester. Adjust the dates.",
  "常规提交截止后须在本学期内保留完整 7 天收尾期，请提前常规截止日期。": "Allow seven full closing days within the semester. Move the regular deadline earlier.",
  "可包含入班前的运动，但不能补今天或未来日期。新增补卡须在打卡结束日期前完成，已创建记录可继续提交材料；每日、每周次数按实际运动日期计算。": "Exercise before enrollment is allowed, but not today or future dates. Create historical records by the exercise end date. Existing records can still receive materials. Daily and weekly limits follow the actual exercise date.",
  "补练授权须位于课程打卡起止日期内，不能延长打卡结束日期；已开始的运动可以继续提交材料。": "Make-up authorization must stay within the course exercise dates and cannot extend the end date. Materials for exercise already started can still be submitted.",
  "请等待课程结算状态读取完成；读取失败时关闭弹窗后重试。": "Wait for settlement status to load. If loading fails, close this dialog and retry.",
  "结算后只能更正结算前已存在的成绩。": "After settlement, only grades that already existed can be corrected.",
  "结算后的成绩更正必须填写原因。": "Provide a reason for a grade correction after settlement.",
  "最终成绩更正已保存，已生成新版结算报告，原版保留。": "The grade correction is saved with a new settlement report. The original is retained.",
  "课程已结算，请在每名学生的成绩弹窗中填写更正原因并选择发布状态。": "The course is settled. Enter a correction reason and publication state in each student's grade dialog.",
  "审核恢复记录异常，请联系管理员核查。": "The saved review request is inconsistent. Ask an administrator to investigate.",
  "两类认可量须为非负数并精确到整分钟，合计不得超过 20 小时。": "Both recognized amounts must be nonnegative whole minutes, totaling no more than 20 hours.",
  "审核结果已保存，认可分钟按服务端审核结果计入。": "The review is saved. Recognized minutes follow the confirmed review result.",
  "未开始": "Not started",
  "状态待核对": "Status needs checking",
  "授权补练": "Grant makeup exercise",
  "最低运动时长": "Exercise duration threshold",
  "每周最多次数": "Weekly attempt limit",
  "次": "attempts",
  "授权学生补练": "Grant student makeup exercise",
  "为指定学生设置补练时间窗口，学生实际运动并提交材料后按课程规则审核。": "Set a makeup window for this student. Their exercise and submitted evidence are reviewed under the course rules.",
  "确认授权 / 重试": "Confirm grant / retry",
  "保存成绩更正": "Save grade correction",
  "结算后成绩更正原因": "Reason for correcting a settled grade",
  "将本次更正发布到内部成绩册": "Publish this correction to the internal gradebook",
  "仅更正结算前已存在的成绩；原因用于审计，原成绩和原结算报告保留。待确认请求会按原内容重试。": "Only grades that existed before settlement can be corrected. The reason is audited and original grades and reports are retained. Unconfirmed requests retry their original content.",
  "暂无审核意见": "No review comment",
  "认可历史 v": "Recognition history v",
  "：课程运动": ": course exercise",
  "分钟，其他运动": "minutes, general exercise",
  "分钟 ·": "minutes ·",
  "调整认可分钟": "Adjust recognized minutes",
  "免测审核保留免测事实；组织认证按上述小时数换算为认可分钟，按课程分类目标封顶，不向学生披露内部成绩。": "Exemption reviews preserve the exemption fact. Organization recognition converts these hours to minutes, capped by each course target. Internal grades are not disclosed to students.",
  "上次审核结果待确认，确认审核将重试原请求。": "The previous review result is unconfirmed. Confirming retries the original request.",
  "存在结果未确认的成绩保存，请先重试原保存请求，再发布成绩。": "A grade save is awaiting confirmation. Retry the original save before publishing grades.",
  "尚未发布规则": "Rules not published",
  "进度暂不可用": "Progress unavailable",
  "课程规则未发布，进度暂不可用": "Course rules are not published; progress is unavailable",
  "最终成绩": "Final grade",
  "查看 / 修改成绩": "View / edit grade",
  "尚未录入": "Not entered yet",
  "请填写 -2147483648 至 2147483647 之间的整数成绩。": "Enter an integer grade between -2147483648 and 2147483647.",
  "最终成绩草稿已保存，历史版本已保留。": "Final grade draft saved. Previous versions are retained.",
  "当前没有可发布的最终成绩草稿。": "No final grade drafts are available to publish.",
  "本页显示教师手填的最终成绩，保存与发布均保留服务端历史版本。": "This page shows teacher-entered final grades. Saving and publishing retain previous versions on the server.",
  "教师填写整数最终成绩，保存为草稿；发布仅用于内部成绩管理，历史版本保留。": "Enter an integer final grade and save it as a draft. Publishing is for internal grade management; previous versions are retained.",
  "发布当前课程已录入的最终成绩草稿，保留历史版本；不向学生披露或推送内部成绩。": "Publish entered final grade drafts for this course and retain previous versions. Internal grades are not disclosed or sent to students.",
  "待补证": "Awaiting supplementary evidence",
  "技术处理中": "Processing",
  "演示模式没有发送审核请求，请登录真实教师账号进行退回补证操作。": "Demo mode has not sent a review request. Sign in with a teacher account to request supplementary evidence.",
  "请选择24或72小时补证窗口。": "Select a 24-hour or 72-hour supplementary evidence window.",
  "已退回补证，记录和补证期限已更新。": "Supplementary evidence requested. The record and deadline have been updated.",
  "该记录已不是无效状态，请根据最新记录重新操作。": "This record is no longer invalid. Review its latest state before trying again.",
  "本次纠正请求已建立，请保留原说明重试，或关闭后重新操作。": "This correction request has been prepared. Retry with the original explanation, or close it and start again.",
  "北师香港浸会大学 · 体育课程管理平台":
    "Beijing Normal-Hong Kong Baptist University · Physical Education Management Platform",
  体育课程管理平台: "Physical Education Management Platform",
  体育课程管理平台标志: "Physical Education Management Platform logo",
  正在确认系统状态: "Checking system status",
  系统维护中: "System maintenance",
  "正在读取服务端最新运行状态，确认完成前所有业务入口保持关闭。":
    "All business entry points remain closed until the latest server status is confirmed.",
  "普通学生与教师业务暂不可用，请等待授权管理员恢复系统。":
    "Student and teacher features are temporarily unavailable until an authorised administrator restores service.",
  "预计恢复时间：请留意管理员后续通知":
    "Estimated recovery: watch for an administrator update",
  "管理员治理入口 · Administrator access": "Administrator access",
  正在恢复登录状态: "Restoring your session",
  登录状态已保留: "Your session is still saved",
  "正在核验已保存的登录凭据，请稍候。":
    "Checking your saved sign-in credentials. Please wait.",
  "当前暂时无法连接服务，已保存的登录凭据不会被删除。":
    "The service is temporarily unreachable. Your saved sign-in credentials have not been deleted.",
  重试恢复: "Retry session restore",
  使用其他账号: "Use another account",
  "已保存的会话不属于教师或管理员账号。":
    "This saved session does not belong to a teacher or administrator account.",
  登录管理平台: "Sign in to the Management Platform",
  "使用学校分配的教师或管理员账号登录。":
    "Sign in with the teacher or administrator account assigned by the university.",
  学校邮箱: "University email",
  请输入学校邮箱: "Enter your university email",
  密码: "Password",
  请输入密码: "Enter your password",
  显示或隐藏密码: "Show or hide password",
  "正在登录…": "Signing in…",
  登录: "Sign In",
  "忘记密码或无法登录？": "Forgot your password or unable to sign in?",
  测试教师: "Test Teacher",
  测试管理员: "Test Administrator",
  本地审查数据: "Local review data",
  本地审查: "LOCAL REVIEW",
  开发预览: "DEVELOPMENT PREVIEW",
  跳过登录: "Skip sign-in",
  "无需登录即可打开完整教师端或管理端界面；预览数据只保留在当前浏览器。":
    "Open the complete teacher or administrator interface without signing in. Preview data stays in this browser only.",
  可跳过登录查看的工作区: "Workspaces available without sign-in",
  跳过登录查看教师端: "Skip sign-in and view teacher portal",
  跳过登录查看管理端: "Skip sign-in and view administrator portal",
  免登录预览模式: "Sign-in-free preview mode",
  "完整界面使用本地预览数据，不会向真实 Backend 发送业务写入。":
    "The complete interface uses local preview data and does not send business writes to the real Backend.",
  复位预览: "Reset preview",
  "预览数据已复位。": "Preview data reset.",
  免登录测试入口: "Password-free test access",
  "仅使用浏览器内的合成数据，不会向真实 Backend 登录或写入业务数据。":
    "Uses synthetic browser data only. It does not authenticate with or write to the real Backend.",
  免登录测试角色: "Password-free test roles",
  测试教师端: "Test teacher",
  课程与审核流程: "Courses and reviews",
  测试管理员端: "Test administrator",
  系统治理工作台: "Governance workspace",
  "正式登录仍仅使用后端认证与授权数据，并根据账号权限进入对应工作台":
    "Formal sign-in still uses Backend authentication and authorization only.",
  免登录测试模式: "Password-free test mode",
  "仅使用本地合成数据，不会向真实 Backend 发送业务请求。":
    "Synthetic local data only; no business request is sent to the real Backend.",
  复位数据: "Reset data",
  "Mock 数据已复位。": "Mock data reset.",
  退出测试: "Exit test",
  重置密码: "Reset password",
  验证邮箱: "Verify email",
  设置新密码: "Set a new password",
  密码已更新: "Password updated",
  使用新密码保护您的教师账号:
    "Protect your teacher account with a new password",
  账号安全设置已完成: "Account security setup is complete",
  无法登录协助: "Sign-in assistance",
  密码重置完成: "Password reset complete",
  返回登录: "Back to sign in",
  "请输入工号后继续。": "Enter your staff ID to continue.",
  "请输入邮箱收到的 6 位验证码。": "Enter the 6-digit code sent to your email.",
  "新密码至少 8 位，并同时包含字母和数字。":
    "Your new password must contain at least 8 characters, including letters and numbers.",
  "两次输入的新密码不一致。": "The new passwords do not match.",
  "输入教师或管理员工号。验证通过后，系统会向该账号绑定的邮箱发送密码重置验证码。":
    "Enter a teacher or administrator staff ID. After verification, a password-reset code will be sent to the email linked to the account.",
  工号: "Staff ID",
  请输入工号: "Enter your staff ID",
  发送验证码: "Send verification code",
  "收不到邮箱验证码或账号无法使用？":
    "Cannot receive an email code or access your account?",
  "验证码已发送至绑定邮箱（已脱敏显示）。验证码 10 分钟内有效，仅可使用一次。":
    "A verification code has been sent to the linked email address (masked). It is valid for 10 minutes and can be used once.",
  "6 位验证码": "6-digit verification code",
  "请输入 6 位数字验证码": "Enter the 6-digit verification code",
  验证并继续: "Verify and continue",
  "未收到验证码？同一邮箱 60 秒后可重新发送；连续输错 5 次将锁定 15 分钟。":
    "Didn't receive the code? You can resend after 60 seconds; five consecutive incorrect attempts lock the account for 15 minutes.",
  "无法使用绑定邮箱？": "Cannot access the linked email?",
  "请设置新密码。成功后，当前账号在所有设备上的旧登录状态将失效。":
    "Set a new password. Once successful, all previous sign-in sessions for this account will be invalidated.",
  新密码: "New password",
  "至少 8 位，包含字母和数字":
    "At least 8 characters, including letters and numbers",
  确认新密码: "Confirm new password",
  请再次输入新密码: "Enter the new password again",
  确认重置密码: "Confirm password reset",
  账号安全: "Account security",
  修改密码: "Change password",
  "定期更新密码，有助于保护课程和学生信息。":
    "Updating your password regularly helps protect course and student information.",
  "退出当前登录后，通过已验证学校邮箱完成身份验证并设置新密码。":
    "After signing out, verify your identity through your verified university email and set a new password.",
  "使用当前密码设置新密码，成功后保留当前登录。":
    "Set a new password using your current password and remain signed in.",
  "无需离开工作台，完成身份验证并设置新密码":
    "Verify your identity and set a new password without leaving the workspace",
  修改密码进度: "Password change progress",
  验证身份: "Verify identity",
  设置密码: "Set password",
  "通过当前账号已验证的学校邮箱完成身份验证；整个过程保留在当前工作台内。":
    "Verify your identity with the university email linked to this account. You will remain in the current workspace while completing the steps.",
  当前账号: "Current account",
  已验证邮箱: "Verified email",
  "免登录预览仅展示流程，不会发送验证码，也不会修改账号密码。":
    "Preview only: no verification email will be sent and no password will be changed.",
  完整学校邮箱: "Complete verified email",
  "请输入上方脱敏邮箱对应的完整地址。":
    "Enter the complete address represented by the masked email above.",
  请输入已验证学校邮箱: "Enter the verified university email",
  返回账号信息: "Back to account",
  预览下一步: "Preview next step",
  "正在发送…": "Sending…",
  "输入邮件验证码并设置新密码；修改完成后，该账号现有登录状态将全部失效。":
    "Enter the email verification code and set a new password. Existing sign-in sessions will be revoked after completion.",
  "当前为免登录预览，最终提交已禁用。":
    "Preview only: the final submission is disabled.",
  "验证码有效期至：": "Verification expires at: ",
  请输入验证码: "Enter the verification code",
  上一步: "Previous",
  预览模式不可提交: "Disabled in preview",
  验证并修改密码: "Verify and update",
  "Backend 已撤销该账号现有登录状态，请使用新密码重新登录。":
    "The Backend has revoked existing sign-in sessions. Sign in again with the new password.",
  去设置: "Set up",
  去修改: "Change",
  "修改后，其他设备上的登录状态将失效；请使用新密码重新登录。":
    "After the change, sign-in sessions on other devices will be invalidated. Sign in again with the new password.",
  当前密码: "Current password",
  请输入当前密码: "Enter your current password",
  显示或隐藏当前密码: "Show or hide current password",
  显示或隐藏新密码: "Show or hide new password",
  显示或隐藏确认密码: "Show or hide password confirmation",
  新密码要求: "New password requirements",
  "至少 8 位字符": "At least 8 characters",
  同时包含字母和数字: "Includes both letters and numbers",
  "✓ 两次密码一致": "✓ Passwords match",
  两次输入的密码不一致: "The passwords do not match",
  确认更新: "Confirm update",
  新密码设置成功: "New password set successfully",
  "为保护账号安全，其他设备上的登录状态将失效。请在需要时使用新密码重新登录。":
    "To protect your account, sign-in sessions on other devices will be invalidated. Sign in again with the new password when needed.",
  完成: "Done",
  "请输入当前密码以验证身份。":
    "Enter your current password to verify your identity.",
  "如账号不存在、已停用，或无法使用绑定邮箱，请联系系统管理员完成身份核验后处理账号恢复或联系方式更新。":
    "If the account does not exist, is disabled, or the linked email is inaccessible, contact a system administrator for identity verification and account recovery or contact-detail updates.",
  "教师和管理员：管理员核实账号状态，并协助更新有效邮箱或恢复账号。":
    "Teachers and administrators: an administrator verifies the account status and can help update a valid email or restore the account.",
  "学生：请使用学生端验证码登录；手机号和邮箱均失效时，由管理员核验身份后绑定新的联系方式。":
    "Students: use the student verification-code sign-in. If both phone and email are unavailable, an administrator will verify identity before linking new contact details.",
  "请勿仅凭姓名或学号请求登录；身份核验需通过学校规定的安全渠道完成。":
    "Do not request sign-in access using only a name or student number; identity checks must use the university's approved secure channels.",
  "密码已重置。请使用新密码重新登录；为保护账号安全，所有旧登录状态均已失效。":
    "Your password has been reset. Sign in again with the new password; all previous sessions have been invalidated to protect your account.",
  使用新密码登录: "Sign in with the new password",
  进入演示模式: "Enter demo mode",
  演示模式选项: "Demo mode options",
  教师端演示: "Teacher demo",
  管理员端演示: "Administrator demo",
  系统将根据账号权限自动进入对应工作台:
    "You will be directed to the appropriate workspace based on your account permissions.",
  教师端: "Teacher portal",
  管理员工作台: "Administrator workspace",
  师: "T",
  "隐私政策 · 使用帮助": "Privacy · Help",
  "请输入账号与密码后继续。": "Enter your account and password to continue.",
  "请输入学校邮箱与密码后继续。": "Enter both the school email and password.",
  "该账号不是教师或管理员，无法登录本平台。":
    "This account is not a teacher or administrator and cannot sign in to this platform.",
  "账号资料与登录角色不一致，请联系管理员。":
    "The account profile does not match the signed-in role. Contact an administrator.",
  演示数据: "Demo data",
  "Mock 审核通过": "Approved in mock",
  "Mock 记录已标记为有效，汇总已在本地更新。":
    "The mock record is now valid and local totals were updated.",
  "Mock 记录已追加有效结论；原无效情景可通过复位数据恢复。":
    "A valid mock decision was appended. Reset data to restore the invalid scenario.",
  "Mock 记录已标记为无效，汇总已在本地更新。":
    "The mock record is now invalid and local totals were updated.",
  "Mock 当前学期": "Current mock semester",
  "Mock 打卡时间窗与学时目标已保存到本地。":
    "The mock check-in window and hour targets were saved locally.",
  "2025-2026 第二学期": "2025-2026 Semester 2",
  "该功能后端暂未开放。": "This feature is not yet enabled on the backend.",
  "找不到该教学班，请刷新后重试。":
    "This class section could not be found. Refresh and try again.",
  "该教学班不是后端真实数据（演示模式），无法保存到服务器。":
    "This class section is demo data rather than a backend record, so it cannot be saved to the server.",
  "打卡时间窗已保存到后端，学生端立即生效；学时目标暂存本地，等成绩规则接口开放后再同步。":
    "The check-in window was saved to the backend and applies to students immediately. Hour targets stay on this device until the score-rule API opens.",
  "提交的内容格式不正确，请检查后重试。":
    "Some submitted fields are invalid. Check and try again.",
  "账号或密码不正确。": "Incorrect account or password.",
  "登录状态已失效，请重新登录。": "Your session has expired. Sign in again.",
  "没有权限执行该操作。": "You do not have permission for this action.",
  "资源不存在或已被移除。": "The resource does not exist or was removed.",
  "数据已在别处更新，请刷新后重试。":
    "The data changed elsewhere. Refresh and try again.",
  "操作过于频繁，请稍后再试。": "Too many attempts. Try again later.",
  "请联系管理员完成身份核验与账号恢复。":
    "Contact an administrator to verify your identity and restore your account.",
  "密码修改尚未接入 Backend；此页面不会伪造修改成功。":
    "Password changes are not yet connected to the Backend; this page will not report a false success.",
  "无法读取 Backend 真实数据": "Unable to load live Backend data",
  重试: "Retry",
  课程管理: "Course Management",
  学生管理: "Student Management",
  性别: "Gender",
  年级: "Grade",
  加入时间: "Joined at",
  加入方式: "Join method",
  "2023级": "2023 cohort",
  "2024级": "2024 cohort",
  已移出课程: "Removed from course",
  已退出课程: "Exited course",
  成员关系已停用: "Membership disabled",
  扫码加入: "Joined by QR code",
  手动导入: "Manual import",
  今日直接加入: "Direct joins today",
  今日新增学生: "New students today",
  非在课成员: "Inactive members",
  加入信息: "Join details",
  成员状态: "Membership status",
  移出课程原因: "Reason for removal",
  打卡审核: "Check-in Review",
  内部成绩册: "Internal gradebook",
  成绩管理: "Grade Management",
  免测与认证: "Exemptions & Verification",
  免测与组织认证: "Exemptions & Organization Verification",
  教学业务: "TEACHING OPERATIONS",
  "管理本人授课班级、课程目标与邀请码。":
    "Manage your classes, credit targets, and invitation codes.",
  "管理本人授课班级、课程目标、打卡时间窗与邀请码。":
    "Manage your classes, credit targets, check-in windows, and invitation codes.",
  "管理课程学生、跟进学时进度与课程状态。":
    "Manage course rosters, follow up on credit progress, and track enrollment status.",
  "查看直接加入的课程成员、加入信息、学时进度与当前状态。":
    "View directly enrolled course members, join details, credit progress, and current status.",
  "按学生查看打卡完成情况、系统辅助置信度与全部运动凭证。":
    "Review check-in completion, system confidence, and all activity evidence by student.",
  "集中处理学生打卡记录与异常内容。":
    "Review pending student check-ins and records that need attention.",
  "查看内部成绩投影。换算分、等级和排名不向学生披露。":
    "Review the internal gradebook. Converted scores, bands, and rankings are not disclosed to students.",
  "审核医学免测及校队、社团认证，并配置相应分数或学时抵扣。":
    "Review medical exemptions and team or club verification, then set grades or credit offsets.",
  "审核免测申请及组织认证材料。":
    "Review exemption requests and organization verification materials.",
  教师空间: "Teacher Workspace",
  北师香港浸会大学: "Beijing Normal-Hong Kong Baptist University",
  "BNBU · 体育课程管理平台": "BNBU · Physical Education Management Portal",
  "BNBU 体育课程管理平台": "BNBU Physical Education Management Portal",
  "BNBU 体育": "BNBU SPORTS",
  "BNBU 校园体育": "BNBU CAMPUS SPORTS",
  体育: "SPORTS",
  "BNBU 校徽": "BNBU emblem",
  "© 2026 北师香港浸会大学":
    "© 2026 Beijing Normal-Hong Kong Baptist University",
  当前学期: "Current term",
  "2025–2026 · 第二学期": "2025–2026 · Semester 2",
  "2025–2026 第二学期": "2025–2026 Semester 2",
  "2025–2026 第一学期": "2025–2026 Semester 1",
  通知: "Notifications",
  "目前没有新的系统通知。": "There are no new system notifications.",
  "＋ 新建教学班": "+ Create class",
  "＋ 新建课程": "+ Create course",
  学时完成率: "Credit completion",
  学生达标情况: "Student qualification",
  达标率: "Qualification rate",
  当前运动任务: "Current activity task",
  暂无进行中的任务: "No active task",
  邀请码: "Invitation code",
  "管理课程 →": "Manage class →",
  待审核: "Pending",
  已处理: "Processed",
  教学班: "Class",
  课程管理核心统计: "Course management summary",
  全部教学班: "All classes",
  学生: "Student",
  提交时间: "Submitted",
  "状态 / 操作": "Status / action",
  教学班学生名单: "Class roster",
  学生管理核心统计: "Student management summary",
  学生列表状态筛选: "Student status filters",
  学生总数: "Total students",
  未达标人数: "Below target",
  全部: "All",
  待跟进: "Needs follow-up",
  已达标: "Target met",
  在班学生: "Enrolled students",
  "＋ 补录学时": "+ Add credits",
  课程运动: "Course activity",
  其他运动: "Other activity",
  操作: "Actions",
  目标: "Target",
  已减免: "Exempted",
  补录: "Add credits",
  补录学时: "Add credits",
  减免时长: "Adjust required credits",
  历史只读: "Read-only history",
  按学生集中审核打卡记录: "Review check-ins by student",
  打卡审核核心统计: "Check-in review summary",
  待审核记录状态筛选: "Pending record filters",
  打卡记录视图筛选: "Check-in record view filters",
  待审核记录: "Pending records",
  "待审核记录（历史遗留）": "Pending records (legacy)",
  已标记无效: "Marked invalid",
  涉及学生: "Students involved",
  需要关注记录: "Records needing attention",
  全部待审核记录: "All pending records",
  低置信度记录: "Low-confidence records",
  全部记录: "All records",
  历史: "history",
  记录: "records",
  历史记录: "Record history",
  条已提交记录: "submitted records",
  当前筛选没有待审核记录: "No pending records match this filter",
  当前筛选没有无效记录: "No invalid records match this filter",
  "切换状态筛选查看其他打卡记录。":
    "Choose another status filter to view other check-in records.",
  暂无打卡记录: "No check-in records",
  "学生提交后的记录会保留在此处。":
    "Submitted student records remain available here.",
  "切换到全部记录可回看已处理内容。":
    "Switch to all records to review processed content.",
  "先查看全体学生的学时与系统辅助置信度，再进入个人详情，以列表或相册方式浏览全部打卡凭证。":
    "Start with all students’ credits and system confidence, then open a student record to view all evidence as a list or album.",
  查看学生打卡: "View student check-ins",
  学生打卡名单: "Student check-in list",
  "展示当前教师全部在班学生的打卡完成情况。":
    "Shows check-in progress for all students currently enrolled in your classes.",
  名学生: "students",
  全部打卡记录: "All check-in records",
  共: "Total",
  "条记录；点击任一运动凭证可查看完整打卡数据并进行审核调整。":
    " records. Select any activity evidence to view full check-in details and adjust the review.",
  打卡记录展示方式: "Check-in display",
  列表: "List",
  相册: "Album",
  课程相关: "Course-related",
  系统抵扣: "System offset",
  低风险: "Low risk",
  需关注: "Needs attention",
  凭证模糊: "Unclear evidence",
  有效: "Valid",
  已调整: "Adjusted",
  教师补录: "Teacher entry",
  补录记录: "Manual entry",
  年: "year",
  月: "month",
  日: "day",
  成绩录入: "Grade entry",
  "按教学班确认耐力跑用时并查看内部换算。换算分、等级不向学生披露。":
    "Confirm endurance-run times by class and review the internal conversion. Converted scores and bands are not disclosed to students.",
  发布成绩: "Publish grades",
  耐力跑: "Endurance run",
  未录入: "Not recorded",
  录入用时: "Enter time",
  标记缺考: "Mark absent",
  免测: "Exempt",
  已发布: "Published",
  待发布: "Awaiting publication",
  免测与组织认证核心统计: "Exemptions and verification summary",
  认证申请状态筛选: "Application status filters",
  全部申请: "All applications",
  "耐力跑免测设置自定义分数；校队/社团认证分配最多 20 小时抵扣。":
    "Set a custom score for endurance-run exemptions; team and club verification can offset up to 20 credits.",
  待补材料: "More material needed",
  已通过: "Approved",
  已驳回: "Rejected",
  耐力跑免测: "Endurance-run exemption",
  校队认证: "Varsity team verification",
  社团认证: "Club verification",
  审核: "Review",
  撤销抵扣: "Revoke offset",
  教师端业务操作: "TEACHER WORKSPACE",
  关闭: "Close",
  取消: "Cancel",
  保存: "Save",
  确认: "Confirm",
  确认操作: "Confirm action",
  确认审核: "Confirm review",
  确认发布: "Confirm publication",
  确认审核结果: "Confirm review result",
  新建教学班: "Create class",
  "教师只能在当前学期创建课程，创建后自动成为授课教师。":
    "Teachers can create classes only in the current term and become the instructor automatically.",
  创建教学班: "Create class",
  未知课程: "Unknown course",
  "课程名称为必填项。": "Course name is required.",
  "真实后端尚未实现教师仅按课程名称创建课程的接口；本次未发送旧格式请求。":
    "The real backend does not yet support teacher-created courses by name only; no legacy request was sent.",
  新建课程: "Create course",
  "教师可以在当前学期自定义课程名称，创建后自动成为责任教师。":
    "Teachers can name a course in the current term and automatically become its responsible instructor.",
  创建课程: "Create course",
  "找不到该课程，请刷新后重试。":
    "This course could not be found. Refresh the page and try again.",
  "该课程不是后端真实数据（演示模式），无法保存到服务器。":
    "This course is local preview data and cannot be saved to the server.",
  "切换课程状态后可查看其他课程。":
    "Switch the course status to view other courses.",
  课程学生名单: "Course roster",
  "由本课程责任教师设置；学生仅能在本课程规定的时间窗内提交打卡。":
    "Set by the responsible instructor; students can check in only during this course's configured time window.",
  "只发布当前课程中已由服务端生成且尚未发布的成绩投影；缺失投影的学生不会被伪造为已发布。":
    "Publish only server-generated, unpublished grade projections for this course; students without a projection are never shown as published.",
  学期: "Term",
  授课教师: "Instructor",
  课程代码: "Course code",
  教学班号: "Section",
  课程名称: "Course name",
  "如 PE101": "e.g. PE101",
  "如 04班": "e.g. Section 04",
  "如 大学体育（一）": "e.g. University Physical Education I",
  课程设置: "Class settings",
  保存学时目标: "Save credit targets",
  课程目标设置: "Course target settings",
  当前课程: "Current class",
  "大学体育（一）": "University Physical Education I",
  跑步: "Running",
  羽毛球: "Badminton",
  篮球: "Basketball",
  足球: "Football",
  乒乓球: "Table tennis",
  游泳: "Swimming",
  健身: "Fitness",
  骑行: "Cycling",
  "调整当前课程目标。": "Adjust the activity targets for this class.",
  "保存后仅影响本课程，不影响其他课程。":
    "Saving affects only this class and does not change other classes.",
  课程概览: "Course overview",
  "快速确认当前课程状态与已保存目标。":
    "Review the class status and saved targets at a glance.",
  课程目标概览: "Class target overview",
  当前目标: "Current target",
  目标配置: "Target configuration",
  "修改学生在本课程中需要完成的两类最低学时。":
    "Set the minimum credits students must complete in each activity category.",
  课程相关运动最低学时: "Minimum course-related activity credits",
  自主运动最低学时: "Minimum independent activity credits",
  小时: "hours",
  保存设置: "Save settings",
  课程运动最低学时: "Minimum course-activity credits",
  课程相关运动目标: "Course-related activity target",
  自主其他运动最低学时: "Minimum other-activity credits",
  自由运动目标: "Independent activity target",
  运动任务: "Activity tasks",
  "学生每个任务只能提交一次，且仍遵循每日一次/2h 全局规则。":
    "Students can submit each task once and must still follow the one-per-day / 2h global rule.",
  "＋ 新建任务": "+ Create task",
  截止: "Due",
  草稿: "Draft",
  进行中: "Active",
  已关闭: "Closed",
  发布: "Publish",
  暂无运动任务: "No activity tasks",
  "学生端会显示“当前暂无可提交任务，请等待老师发布”。":
    "Students will see “No tasks are available for submission. Please wait for your teacher to publish one.”",
  课程邀请: "Class invitation",
  "邀请码与二维码从生成时起 7 天有效，可提前手动撤销。":
    "The invitation code and QR code are valid for 7 days after creation and can be revoked early.",
  撤销邀请码: "Revoke invitation code",
  生成新邀请码: "Generate new invitation code",
  课程邀请二维码: "Class invitation QR code",
  邀请二维码: "Invitation QR code",
  课程加入邀请码: "Course enrollment invitation",
  复制链接: "Copy link",
  全屏投影: "Present fullscreen",
  下载: "Download",
  打印: "Print",
  "有效期至（北京时间）": "Valid until (Beijing time)",
  "将二维码投影给学生端扫码，或复制邀请码在学生端手动输入。学生确认资料且服务端校验成功后会立即成为课程成员。":
    "Project the QR code for the student app to scan, or copy the invitation code for manual entry. After the student confirms their details and server validation succeeds, they immediately become a course member.",
  "邀请码失效后不能再用于加入课程。生成新邀请码会重新开始 7 天有效期。":
    "An expired invitation cannot be used to join a class. Generating a new invitation starts a fresh 7-day validity period.",
  "邀请码失效后不能再用于加入课程。v8.0 要求 5–120 分钟有效期与 10 分钟宽限；当前接口仍按既有有效期生成，不能在本页改成 5–120 分钟。":
    "An expired invitation cannot be used to join a class. v8.0 requires a 5–120 minute validity window and a 10-minute grace period; the current API still issues the existing expiry, so this page cannot change it to 5–120 minutes.",
  "请使用学生端扫描二维码；无法扫码时，可在学生端手动输入邀请码。":
    "Use the student app to scan the QR code. If scanning is unavailable, enter the invitation code manually in the student app.",
  "二维码仅用于定位课程并携带短期加入凭证；学生资料校验成功后直接加入，无需教师审批。已加入成员会立即出现在学生名单中。":
    "The QR code only identifies the course and carries a short-lived join credential. Successful student-data validation enrolls the student directly without teacher approval, and the member appears in the roster immediately.",
  "此前展示的二维码已失效。请生成新邀请码后再让学生扫码。":
    "The previously displayed QR code is no longer valid. Generate a new invitation before asking students to scan it.",
  "生成后可投影二维码、下载或打印，也可将邀请码发送给学生。":
    "After generation, project, download, or print the QR code, or send students the invitation code.",
  撤销课程邀请码: "Revoke course invitation",
  "撤销后，当前二维码和邀请码将立即失效，学生无法再凭此码加入课程。此操作不会影响已经建立的课程成员关系。":
    "After revocation, the current QR code and invitation code become invalid immediately. Students cannot join with it, while existing course memberships remain unchanged.",
  确认撤销: "Confirm revocation",
  返回: "Back",
  "有效期：": "Valid until: ",
  复制邀请码: "Copy invitation code",
  原邀请码已撤销: "The previous invitation code was revoked",
  尚未生成邀请码: "No invitation code yet",
  保存任务: "Save task",
  任务标题: "Task title",
  任务说明: "Task description",
  学时类别: "Credit category",
  要求时长: "Required duration",
  截止日期: "Due date",
  保存状态: "Save status",
  "1 小时": "1 hour",
  "2 小时": "2 hours",
  审核结果: "Review decision",
  审核意见: "Review comment",
  请选择: "Select an option",
  通过: "Approve",
  退回补证: "Return for proof",
  "当前接口没有退回补证结果，不能写入。":
    "The current API has no return-for-proof result, so this cannot be written.",
  "依据服务端记录追加有效或无效。退回补证仅展示流程，当前正式协议不会写入。":
    "Append valid or invalid from server records. Return-for-proof is displayed only and is not written on the current official contract.",
  "查看 Backend 实时健康状态。统一运动模板与有限审核授权走 Contract；Backend 未实现时显示真实错误。":
    "View live Backend health. Unified sport templates and limited review grants use Contract; unimplemented Backend responses show the real error.",
  "查看 Backend 实时健康状态。模板发布、有限审核授权走 Contract，失败时显示真实错误。":
    "View live Backend health. Template publishing and limited review grants use Contract; failures show the real error.",
  "管理本人班级与时间窗。已发布课程的门槛由模板锁定；本页不能改公式。邀请按 5–120 分钟生成。":
    "Manage your classes and time windows. Published-course thresholds stay locked by template; this page cannot change the formula. Invitations are created for 5–120 minutes.",
  "查看直接加入的成员。电子名单走现有导入；纸质 OCR 走 Contract allocateRosterOcr，未确认草稿不会当成当前名单。":
    "View directly joined members. Spreadsheet import uses the current API; paper OCR uses Contract allocateRosterOcr and unconfirmed drafts are not treated as the current roster.",
  "设置分管理员账号与现有侧栏权限。有限审核授权走 Contract createLimitedReviewGrant。":
    "Set sub-admin accounts and existing sidebar permissions. Limited review grants use Contract createLimitedReviewGrant.",
  "维护四套耐力跑换算表，并可通过 Contract 发布运动模板。已开课课程不会被回溯改门槛。":
    "Maintain the four endurance conversion tables and publish sport templates through Contract. Open courses are not changed retroactively.",
  "维护四套耐力跑成绩换算规则。学时目标仅由任课教师在教学班内配置。":
    "Maintain the four endurance conversion tables. Hour targets are configured only by the responsible teacher inside a class.",
  "维护服务端总学时成绩规则草稿，并执行双管理员审批流程。":
    "Maintain the server-side total-hour grade-rule draft and run the two-administrator approval flow.",
  "查看服务端教学班与时间窗。已发布课程门槛锁定；邀请按 Contract durationMinutes 生成。":
    "View server class sections and time windows. Published-course thresholds stay locked; invitations use Contract durationMinutes.",
  "查看真实课程成员。电子名单走现有导入；纸质 OCR 走 Contract，未确认草稿不会当成当前快照。":
    "View live course members. Spreadsheet import uses the current API; paper OCR uses Contract and unconfirmed drafts are not treated as the current snapshot.",
  "维护四套耐力跑换算表，并可通过 Contract 发布运动模板。":
    "Maintain the four endurance conversion tables and publish sport templates through Contract.",
  "审核免测与认证。内部自定义分不向学生披露；抵扣字段仍写入现有申请接口。":
    "Review exemptions and certifications. Internal custom scores are not shown to students; offset fields still write the current application API.",
  "只读查看当前全部课程。不代填成绩，不开放单条打卡下钻。":
    "Read-only view of all current courses. Do not enter grades or drill into individual check-ins.",
  "审核服务端免测申请；内部自定义分不向学生披露。审核结论不会自动生成分数。":
    "Review server exemption applications; internal custom scores are not shown to students. A review does not invent a score.",
  驳回: "Reject",
  要求补正: "Request correction",
  要求补材料: "Request more material",
  "学生可见；请说明处理结果或下一步操作":
    "Visible to the student; explain the decision or next step.",
  移出课程: "Remove from course",
  减免运动时长: "Adjust required credits",
  补录学生学时: "Add student credits",
  "确认后该成员关系变为“已移出课程”；旧打卡和成绩保留为历史只读。":
    "After confirmation, the membership becomes Removed from course; previous check-ins and grades remain read-only history.",
  确认移出课程: "Confirm removal",
  "减免只降低该学生对应类别的完成目标，不修改已有打卡记录。":
    "An adjustment lowers the target for the selected category without changing existing check-ins.",
  "教师补录不占用学生每日一次/2h额度，并立即计入统计。":
    "Teacher entries do not use the student's daily one-submission / 2h allowance and are counted immediately.",
  补录时长: "Added credits",
  运动项目: "Activity",
  "教师凭证（可选）": "Teacher evidence (optional)",
  "如 校园跑、课堂活动": "e.g. campus run, class activity",
  凭证文件名: "Evidence file name",
  减免类别: "Adjusted category",
  补录原因: "Reason for entry",
  减免原因: "Reason for adjustment",
  操作原因: "Reason for action",
  保存调整: "Save adjustment",
  打卡开始时间: "Check-in start",
  打卡结束时间: "Check-in end",
  实际运动时间: "Actual activity time",
  计入学时: "Counted credits",
  运动说明: "Activity description",
  "提交日期：": "Submitted: ",
  未提供公开原因: "No public reason provided",
  "本次审核：": "Current review: ",
  系统辅助: "System assistance",
  置信度: "Confidence",
  位置: "Location",
  "位置信息已过期（超过 90 天）": "Location data expired (over 90 days)",
  "校内运动区域 · 可查看地图位置":
    "On-campus activity area · map location available",
  运动凭证: "Activity evidence",
  "预览 / 下载原件": "Preview / download original",
  无凭证文件: "No evidence files",
  "该记录未附带照片或视频。": "This record has no attached photo or video.",
  "0 小时（作废）": "0 hours (void)",
  学生可见审核意见: "Student-visible review comment",
  耐力跑状态: "Endurance-run status",
  分钟: "Minutes",
  秒: "Seconds",
  自动换算: "Automatic conversion",
  缺考原因: "Reason for absence",
  "我已检查全班内部成绩，确认发布不向学生披露换算分、等级或排名":
    "I have reviewed the internal class gradebook and confirm publication will not disclose converted scores, bands, or rankings to students.",
  免测分数: "Exemption score",
  "根据实际情况自定义，不固定为 100 分":
    "Set this according to the circumstances; it is not fixed at 100.",
  课程运动抵扣: "Course-activity offset",
  其他运动抵扣: "Other-activity offset",
  "两类合计不得超过 20 小时；学生端按抵扣后的目标计算剩余学时。":
    "The two offsets combined cannot exceed 20 hours; the student portal calculates remaining credits using the adjusted target.",
  请明确需要补充的材料: "Specify the additional material required",
  请说明审核依据和处理结果: "Explain the basis for the review and its outcome",
  预览: "Preview",
  关闭预览: "Close preview",
  学生上传图片: "Student-uploaded image",
  学生上传文件: "Student-uploaded file",
  证明材料预览: "Evidence preview",
  "证明材料 · 第 1 页": "Evidence · Page 1",
  只读预览: "Read-only preview",
  文件信息: "File information",
  文件名: "File name",
  提交人: "Submitted by",
  学生证明材料: "Student supporting materials",
  "份 · 点击缩略图或文件名预览":
    " files · Select a thumbnail or filename to preview",
  "预览 ↗": "Preview ↗",
  图片: "Image",
  凭证: "Evidence",
  文件: "File",
  未知教学班: "Unknown class",
  未知学生: "Unknown student",
  男: "Male",
  女: "Female",
  "大一/大二": "Year 1 / Year 2",
  "大三/大四": "Year 3 / Year 4",
  "缺考 0分": "Absent · 0 points",
  等待录入: "Awaiting entry",
  学生信息: "Student information",
  学生详情: "Student details",
  关闭学生详情: "Close student details",
  学生资料: "Student profile",
  学号: "Student ID",
  邮箱: "Email",
  班级: "Class",
  专业: "Major",
  当前课程信息: "Current course information",
  课程状态: "Course status",
  基础信息: "Basic information",
  快捷操作: "Quick actions",
  累计运动学时: "Total activity credits",
  打卡次数: "Check-in count",
  成绩状态: "Grade status",
  待审核内容: "Pending reviews",
  无: "None",
  在课: "Enrolled",
  暂无成绩: "No grade",
  设置减免: "Adjust required credits",
  查看打卡记录: "View check-in records",
  编辑成绩: "Edit grade",
  "查看 / 编辑成绩": "View / edit grade",
  开始审核: "Start review",
  查看审核详情: "View review details",
  学生详情加载失败: "Could not load student details",
  "学生详情暂时无法加载。": "Student details are temporarily unavailable.",
  "请稍后重试。": "Try again later.",
  重新加载: "Reload",
  "正在加载学生原始材料…": "Loading the student's original evidence…",
  "视频未能加载，请重新获取原件后重试。": "The video could not load. Reload the original and try again.",
  "图片未能加载，请重新获取原件后重试。": "The image could not load. Reload the original and try again.",
  重新加载原件: "Reload original",
  正在加载学生详情: "Loading student details",
  正在加载学生信息: "Loading student information",
  教师: "Teacher",
  每: "per",
  今天: "Today",
  昨天: "Yesterday",
  小时前: " hours ago",

  // Shared controls, tickets, and administration workspace.
  语言: "Language",
  中文: "Chinese",
  英文: "English",
  暂无可选项: "No options available",
  "加载中…": "Loading…",
  搜索选项: "Search options",
  当前选择: "current selection",
  筛选工具栏: "Filter toolbar",
  更多: "More",
  待受理: "Awaiting intake",
  受理中: "In progress",
  待技术团队处理: "Awaiting the technical team",
  处理完成: "Resolved",
  账户与登录: "Accounts & sign-in",
  系统功能: "System features",
  数据与权限: "Data & access",
  其他咨询: "Other inquiries",
  学生端: "Student portal",
  管理端支持请求: "Admin support request",
  工单: "Ticket",
  系统管理员: "System administrator",
  处理状态: "Resolution status",
  回复用户: "Reply to requester",
  "说明处理结果、下一步或预计完成时间":
    "Describe the outcome, next step, or expected completion time",
  "该支持请求将保留在管理端队列，并标记为等待技术团队处理。":
    "This support request will remain in the admin queue and be marked as awaiting the technical team.",
  保存处理结果: "Save resolution",
  "支持请求已移交技术团队处理。":
    "The support request was assigned to the technical team.",
  "工单处理结果已保存并同步给提交人。":
    "The ticket resolution was saved and shared with the requester.",
  "支持请求处理结果已保存并同步给提交人。":
    "The support request resolution was saved and shared with the requester.",
  待处理工单: "Open tickets",
  由管理端统一受理: "Managed centrally by administrators",
  等待技术团队反馈: "Awaiting technical-team feedback",
  今日已完成: "Resolved today",
  处理结果已同步: "Resolution shared",
  支持请求: "Support requests",
  学生问题反馈: "Student issue feedback",
  反馈管理: "Feedback management",
  "查看学生提交的问题类型和问题描述，并跟踪处理状态。":
    "Review the problem category and description submitted by students, and track its handling status.",
  "学生和教师提交的服务请求由管理端统一受理、回复和协调处理。":
    "Service requests from students and teachers are centrally received, answered, and coordinated by administrators.",
  "学生和教师提交的支持请求由管理端统一受理、回复和协调处理。":
    "Support requests from students and teachers are centrally received, answered, and coordinated by administrators.",
  "2 工作小时内首次响应": "First response within 2 business hours",
  "系统功能 / 数据权限": "System features / data access",
  "4 工作小时内首次响应": "First response within 4 business hours",
  "1 工作日内首次响应": "First response within 1 business day",
  工单编号: "Ticket ID",
  类别与主题: "Category & subject",
  来源: "Source",
  "查看并处理 →": "View & handle →",
  "请填写处理说明后再保存。": "Enter a resolution note before saving.",
  状态: "Status",
  全部状态: "All statuses",

  系统概览: "System overview",
  课程目录看板: "Course dashboard",
  教学运行: "Teaching operations",
  "只读查看当前全部课程、学生人数与打卡情况。":
    "View all current courses, student counts, and check-in activity in read-only mode.",
  "只读汇总当前学期全部教学班、成员关系和有效打卡数据。":
    "Read-only summary of all current class sections, memberships, and valid check-in data.",
  "查看服务端当前学期；本地预览完整呈现创建、配置与切换流程。":
    "View the current server semester. The local preview presents the complete creation, configuration, and switching flow.",
  "查看服务端系统模式；本地预览可验证完整的状态切换流程。":
    "View the server system mode. The local preview can verify the complete state-change flow.",
  学期管理: "Term management",
  用户与账号: "Users & accounts",
  分管理员设置: "Sub-administrator settings",
  权限管理: "Permission management",
  "设置分管理员账号、初始密码以及可使用的侧边栏标签权限。":
    "Configure sub-administrator accounts, initial passwords, and accessible sidebar permissions.",
  "设置分管理员账号、初始密码和侧边栏权限；当前预览配置只保存在本浏览器。":
    "Configure sub-administrator accounts, initial passwords, and sidebar permissions. Preview settings are stored in this browser only.",
  全局规则: "Global rules",
  系统模式: "System mode",
  帮助中心: "Help center",
  审计日志: "Audit log",
  系统运行平稳: "System operating normally",
  "当前处于正常模式，优先处理账号恢复与配置提醒。":
    "The system is operating normally. Prioritize account recovery and configuration reminders.",
  "查看 Backend 实时健康状态与当前可用的管理数据。":
    "Review live Backend health and the administration data currently available.",
  全局治理: "Global governance",
  "创建、切换与归档学期。切换当前学期会影响全系统业务范围。":
    "Create, switch, and archive terms. Changing the current term affects the whole system's business scope.",
  "管理教师和学生账号、恢复申请、验证码解锁与数据删除。":
    "Manage teacher and student accounts, recovery requests, verification-code unlocks, and data deletion.",
  服务运营: "Service operations",
  "统一受理学生与教师的服务请求，协调处理并同步处理结果。":
    "Receive student and teacher service requests centrally, coordinate handling, and share outcomes.",
  "维护学时目标、每日限额、打卡时间窗和耐力跑换算表。":
    "Maintain credit targets, daily limits, check-in windows, and endurance-run conversion tables.",
  "维护学时目标、每日限额和耐力跑换算表。":
    "Maintain credit targets, daily limits, and endurance-run conversion tables.",
  劳动节假期: "Labor Day holiday",
  期末考试安排: "Final-exam schedule",
  "请完整填写打卡时间窗的日期和每日时段。":
    "Complete the check-in window dates and daily hours.",
  "打卡结束日期不能早于开始日期。":
    "The check-in end date cannot be earlier than the start date.",
  "每日结束时间必须晚于开始时间。":
    "The daily end time must be later than the start time.",
  "学期截止日期不能晚于打卡结束日期。":
    "The term deadline cannot be later than the check-in end date.",
  "常规提交截止日期": "Regular submission deadline",
  "常规提交截止日期不能早于打卡结束日期。": "The regular submission deadline cannot precede the check-in end date.",
  "排除日期请按“YYYY-MM-DD, 原因”每行一条填写。":
    "Enter excluded dates one per line as “YYYY-MM-DD, reason”.",
  "排除日期不能重复。": "Excluded dates cannot be duplicated.",
  "排除日期必须位于打卡日期范围内。":
    "Excluded dates must fall within the check-in date range.",
  "课程设置已保存，学生端将按本教学班的目标和打卡时间窗执行。":
    "Class settings were saved. Students will follow this class’s targets and check-in window.",
  "调整当前课程的学时目标和打卡时间窗。":
    "Adjust the current class’s credit targets and check-in window.",
  "保存后仅影响本教学班，不影响其他课程。":
    "Saving affects only this class, not other classes.",
  "由本教学班授课教师设置；学生仅能在本课程规定的时间窗内提交打卡。":
    "Set by this class’s instructor; students can submit check-ins only within this class’s window.",
  打卡状态: "Check-in status",
  允许打卡: "Check-ins allowed",
  暂停全部打卡: "Pause all check-ins",
  学期截止日期: "Term deadline",
  "此日期后不能开始或补交新的打卡记录。":
    "After this date, students cannot start or submit new check-in records.",
  打卡开始日期: "Check-in start date",
  打卡结束日期: "Check-in end date",
  每日开始时间: "Daily start time",
  每日结束时间: "Daily end time",
  排除日期: "Excluded dates",
  "选填；每行一条，格式为 YYYY-MM-DD, 原因。":
    "Optional; one per line in the format YYYY-MM-DD, reason.",
  "2026-05-01, 劳动节假期\n2026-06-19, 期末考试安排":
    "2026-05-01, Labor Day holiday\n2026-06-19, Final-exam schedule",
  系统维护: "System maintenance",
  "在正常、只读和维护模式之间切换；每次变更都写入审计日志。":
    "Switch between normal, read-only, and maintenance modes; every change is recorded in the audit log.",
  内容管理: "Content management",
  "维护面向学生与教师的中英双语帮助内容。":
    "Maintain bilingual help content for students and teachers.",
  "集中处理系统故障及需要技术团队协助的事项；当前为前端规划功能演示。":
    "Centralize system incidents and requests that need help from the technical team; this is currently a frontend planning demo.",
  "维护面向学生的中英双语帮助内容、关键词与发布状态。":
    "Maintain student-facing bilingual help content, keywords, and publishing status.",
  "追踪关键操作。审计记录只读，不可修改或删除。":
    "Track key actions. Audit records are read-only and cannot be changed or deleted.",
  体育部: "Physical Education Department",
  正常: "Normal",
  验证码锁定: "Verification code locked",
  待交接: "Pending handover",
  已停用: "Disabled",
  主题模式: "Theme",
  浅色: "Light",
  深色: "Dark",
  跟随系统: "System",
  系统配色: "System appearance",
  "选择浅色、深色或跟随系统；设置会自动保存在此设备。":
    "Choose light, dark, or system appearance. Your choice is saved on this device.",
  管理空间: "Administrator workspace",
  主要导航: "Primary navigation",
  演示教师: "Demo Teacher",
  演示管理员: "Demo Administrator",
  演示体育部: "Demo Physical Education Department",
  演示管理部门: "Demo Administration",
  打开演示教师的用户信息: "Open the demo teacher profile",
  打开演示管理员的用户信息: "Open the demo administrator profile",
  打开陈若宁的用户信息: "Open Chen Ruoning's profile",
  打开系统管理员的用户信息: "Open the system administrator profile",
  调整导航栏宽度: "Resize navigation bar",
  展开侧边栏: "Expand sidebar",
  折叠侧边栏: "Collapse sidebar",
  导航栏已折叠: "Navigation bar collapsed",
  导航栏宽度: "Navigation bar width",
  "体育部 · T2024007": "Physical Education Department · T2024007",

  全部学期: "All terms",
  当前: "Current",
  待开始: "Upcoming",
  已归档: "Archived",
  "＋ 创建新学期": "+ Create term",
  "2026年2月23日 — 2026年7月31日 · 3 个教学班 · 126 名学生":
    "February 23, 2026 — July 31, 2026 · 3 classes · 126 students",
  学期进度: "Term progress",
  "第 22 周 / 共 23 周": "Week 22 of 23",
  "归档前需要确认成绩发布状态，已生成检查清单。":
    "Confirm grade-publication status before archiving. A checklist has been generated.",
  归档前检查: "Pre-archive check",
  学期记录: "Term records",
  "切换当前学期会自动归档原当前学期。":
    "Switching the current term automatically archives the previous current term.",
  "2026–2027 第一学期": "2026–2027 Semester 1",
  "已进入切换确认流程。": "The change confirmation process has started.",
  设为当前学期: "Set as current term",
  查看历史数据: "View historical data",
  "2024–2025 第二学期": "2024–2025 Semester 2",

  总用户: "Total users",
  "教师 68 · 学生 3,413 · 管理员 1":
    "68 teachers · 3,413 students · 1 administrator",
  账号恢复: "Account recovery",
  等待身份核验: "Awaiting identity verification",
  可手动解除: "Can be unlocked manually",
  "＋ 创建用户": "+ Create user",
  "搜索姓名、学号、工号或邮箱": "Search name, student ID, staff ID, or email",
  角色: "Role",
  全部角色: "All roles",
  锁定: "Locked",
  停用: "Disabled",
  "已准备批量导入模板。": "The bulk-import template is ready.",
  批量导入: "Bulk import",
  用户: "User",
  "学院 / 部门": "College / department",
  最近活动: "Last activity",
  "管理 →": "Manage →",

  正常模式: "Normal mode",
  学生与教师端全部功能可用: "All student and teacher features are available",
  "允许查看，禁止打卡、审核与其他写操作":
    "Viewing is allowed; check-ins, reviews, and other write actions are disabled",
  维护模式: "Maintenance mode",
  "普通用户仅看到维护页，管理员仍可进入":
    "Regular users see only the maintenance page; administrators can still enter",
  当前系统模式: "Current system mode",
  正常运行: "Operating normally",
  "最近变更：2026-07-18 03:12 · 自动恢复":
    "Last change: July 18, 2026, 3:12 AM · automatic recovery",
  切换原因: "Reason for change",
  必填: "Required",
  "说明本次模式切换原因，将写入审计日志":
    "Describe why this mode is being changed; it will be recorded in the audit log",
  "模式变更将立即生效。": "The mode change takes effect immediately.",
  "请填写切换原因。": "Enter a reason for the mode change.",
  确认切换模式: "Confirm mode change",
  影响范围: "Impact",
  变更前请确认: "Confirm before changing",
  维护模式会立即阻止普通用户进入:
    "Maintenance mode immediately blocks regular users",
  "计划内维护应至少提前 48 小时公告":
    "Scheduled maintenance should be announced at least 48 hours in advance",
  恢复后系统自动发送完成通知:
    "The system automatically sends a completion notice after recovery",

  "已发布 18": "Published 18",
  "草稿 3": "Drafts 3",
  "已下线 6": "Offline 6",
  "＋ 新建帮助文章": "+ Create help article",
  搜索标题或关键词: "Search titles or keywords",
  受众: "Audience",
  全部受众: "All audiences",
  "中英双语完整度 94%": "Chinese and English completeness: 94%",
  "如何提交运动打卡？": "How do I submit a sports check-in?",
  "提交体育打卡的操作说明。": "Instructions for submitting a sports check-in.",
  "学生 · 打卡与学时": "Student · Check-ins & credits",
  "为什么我的打卡时长被调整？": "Why was my check-in duration adjusted?",
  "了解打卡时长被调整的原因。": "Learn why a check-in duration was adjusted.",
  "学生 · 审核反馈": "Student · Review feedback",
  "教师 · 课程管理": "Teacher · Class management",
  "校队和社团成员如何申请学时抵扣？":
    "How do team and club members apply for credit offsets?",
  "了解校队和社团成员申请学时抵扣的流程。":
    "Learn how team and club members apply for credit offsets.",
  "学生 · 组织认证": "Student · Organization verification",
  英文待更新: "English update pending",
  "· 更新于 2026-07-24": "· Updated July 24, 2026",
  "编辑 →": "Edit →",

  "操作人、资源 ID 或请求 ID": "Operator, resource ID, or request ID",
  操作类型: "Action type",
  全部操作类型: "All action types",
  用户管理: "User management",
  配置变更: "Configuration change",
  成绩发布: "Grade publication",
  日期范围: "Date range",
  导出: "Export",
  时间: "Time",
  操作人: "Operator",
  资源: "Resource",
  结果: "Result",
  详情: "Details",
  成功: "Succeeded",
  "展开 →": "Expand →",
  "共 1,284 条记录 · 第 1 / 65 页": "1,284 records · Page 1 of 65",
  上一页: "Previous",
  下一页: "Next",

  全部服务可用: "All services available",
  活跃用户: "Active users",
  "过去 7 天": "Past 7 days",
  今日打卡: "Today's check-ins",
  "成功率 99.7%": "99.7% success rate",
  待处理事项: "Open items",
  "账号恢复 5 · 锁定 2": "5 account recoveries · 2 locked accounts",
  需要处理: "Needs attention",
  系统待办: "System tasks",
  "7 项": "7 items",
  账号恢复申请: "Account recovery requests",
  "5 条等待身份核验": "5 awaiting identity verification",
  处理申请: "Handle requests",
  "2 个学生账号被锁定": "2 student accounts are locked",
  前往解锁: "Go to unlock",
  帮助文章翻译: "Help article translations",
  "1 篇英文内容待更新": "1 English article needs an update",
  更新内容: "Update content",
  系统健康: "System health",
  核心服务: "Core services",
  "健康检查已刷新。": "Health check refreshed.",
  刷新: "Refresh",
  "API 服务": "API service",
  数据库: "Database",
  "12 / 20 连接": "12 / 20 connections",
  通知队列: "Notification queue",
  "0 条积压": "0 queued",
  对象存储: "Object storage",
  当前配置: "Current configuration",
  全局规则快照: "Global rules snapshot",
  "管理规则 →": "Manage rules →",
  总学时目标: "Total credit target",
  "20 小时": "20 hours",
  每日上限: "Daily limit",
  "2 小时 · 1 次": "2 hours · 1 check-in",
  打卡时段: "Check-in hours",
  当前学期截止: "Current term ends",

  "课程将自动关联当前教师与当前学期。":
    "The class will be linked automatically to the current teacher and term.",
  "邀请码 PE01–7K2Q · 7 天内有效":
    "Invitation code PE01–7K2Q · valid for 7 days",
  发布运动任务: "Publish activity task",
  "任务时长仅可设置为 1 小时或 2 小时。":
    "Task duration can only be set to 1 or 2 hours.",
  发布任务: "Publish task",
  "补录不占用学生每日一次、每日两小时额度。":
    "Manual entries do not use a student's daily one-entry, two-hour allowance.",
  确认补录: "Confirm manual entry",
  调整有效时长: "Adjust valid duration",
  "调整后将立即更新统计，并强制通知学生。":
    "The adjustment updates statistics immediately and sends a mandatory student notification.",
  通过耐力跑免测: "Approve endurance-run exemption",
  "请根据材料与课程要求设置免测分数。":
    "Set the exemption score based on the evidence and class requirements.",
  确认通过: "Confirm approval",
  配置组织认证抵扣: "Configure organization-verification offset",
  "抵扣总时长上限 20 小时，可分配至两类学时。":
    "Total offset is limited to 20 hours and can be split between the two credit categories.",
  确认抵扣: "Confirm offset",
  创建新学期: "Create new term",
  "创建后默认为待开始状态。": "New terms are upcoming by default.",
  创建学期: "Create term",
  创建用户: "Create user",
  "教师与管理员账号使用密码登录；学生账号沿用验证码流程。":
    "Teacher and administrator accounts use passwords; student accounts continue to use verification codes.",
  新建帮助文章: "Create help article",
  "请同时维护中文与英文内容。": "Maintain both Chinese and English content.",
  保存草稿: "Save draft",
  全局系统管理账号: "Global system administrator account",
  退出登录: "Sign out",
  "有效期至 2026-08-05 18:00": "Valid until August 5, 2026, 6:00 PM",
  当前身份: "Current role",
  抵扣时长: "Offset duration",
  "名称 / 标题": "Name / title",
  "0、1 或 2 小时": "0, 1, or 2 hours",
  "不超过 20 小时": "No more than 20 hours",
  请输入: "Enter a value",
  "补充信息 / 操作原因": "Additional information / reason for action",
  请输入必要说明: "Enter the required details",
  "身份权限由学校账号管理，当前会话无法自行切换角色。":
    "Account permissions are managed by the university. This session cannot change roles.",
  "教师与管理员统一入口，按身份进入清晰、专注的职责工作台。":
    "A unified entrance for teachers and administrators, with a focused workspace for each role.",
  "统一入口 · 职责清晰 · 高效协同":
    "One portal · Clear roles · Efficient collaboration",
  "体育部 · 教师账号": "Physical Education Department · Teacher account",
  有效时长: "Valid duration",
  有效学时汇总: "Valid credit summary",
  状态异常: "Invalid state",
  "搜索姓名、学号或邮箱": "Search name, student ID, or email",
  人: "students",
  "· 无效": "· Invalid",
  "· 待审核": "· Pending",

  // Teacher workspace: review states, validation, filters, and dialogs.
  已撤销: "Revoked",
  运动时长不符合要求: "Activity duration does not meet the requirement",
  图片或视频无法证明运动过程: "The image or video does not verify the activity",
  媒体内容与运动无关: "The media is unrelated to the activity",
  重复提交: "Duplicate submission",
  疑似代打卡: "Suspected proxy check-in",
  运动记录异常: "Abnormal activity record",
  其他: "Other",
  无效: "Invalid",
  审核状态: "Review status",
  无效原因: "Reason for invalidation",
  "该记录已被判定为无效。": "This record has been marked invalid.",
  "该记录已判定无效，本页暂不支持改回有效。":
    "This record is invalid. Changing it back to valid is not supported on this page.",
  "改回有效时需要填写纠正说明；原无效审核会保留在历史中。":
    "Provide a correction note when changing the record back to valid; the prior invalid review remains in history.",
  "请填写纠正说明。": "Please provide a correction explanation.",
  "正在加载打卡记录": "Loading check-in records",
  "正在读取学生资料和审核结果，请稍候。": "Loading student details and review results. Please wait.",
  "请填写纠正说明；原无效审核记录不会被覆盖。":
    "Enter a correction note; the previous invalid review record will not be overwritten.",
  "本地操作上下文已失效，本次没有发送写请求。请关闭后从最新记录重新操作。requestId：未生成。":
    "The local operation context expired, so no write request was sent. Close this view and retry from the latest record. requestId: not generated.",
  "已追加有效结论；原无效审核仍保留在历史中。":
    "A valid decision was appended; the prior invalid review remains in history.",
  "客户端在写入前发现服务端最新审核状态与本操作不一致，已停止追加并刷新真实状态。requestId：未生成（本地一致性检查停止写入）。":
    "The latest server review state no longer matched this operation, so the client stopped before writing and refreshed the authoritative state. requestId: not generated because the local consistency check stopped the write.",
  "系统会直接追加一条有效结论；原无效审核会完整保留。":
    "The system will append a valid decision directly; the prior invalid review remains intact.",
  确认纠正为有效: "Confirm correction to valid",
  纠正说明: "Correction note",
  "此说明会写入新的有效审核记录，不会覆盖原无效原因。":
    "This note will be written to a new valid review and will not overwrite the prior invalid reason.",
  请说明为什么需要把该记录重新判定为有效:
    "Explain why this record should be classified as valid again",
  打卡审核汇总: "Check-in review summary",
  审核已完成: "Review complete",
  审核中: "Review in progress",
  有效打卡时长进度: "Valid check-in credit progress",
  已达到教师设置的学时目标:
    "The teacher-configured credit target has been reached",
  条: "records",
  完成审核: "Complete review",
  待录入: "Awaiting entry",
  缺考: "Absent",
  已录入: "Entered",
  待补正: "Correction required",
  "请选择一项无效原因。": "Select a reason for invalidation.",
  "选择“其他”时，请填写备注。": "Enter a note when selecting “Other.”",
  "暂无打卡记录需要审核。": "There are no check-in records to review.",
  "审核已完成（结果仅保存在当前页面）。":
    "Review complete (the result is saved only on this page).",
  "；已自动发送不可静默的学生通知。":
    "; a mandatory student notification was sent automatically.",
  "；学生通知已自动生成。":
    "; a student notification was generated automatically.",
  "课程代码、教学班号和课程名称均为必填项。":
    "Course code, section, and class name are required.",
  "当前学期已存在相同课程代码和教学班号。":
    "This term already has the same course code and section.",
  "两类学时目标必须为不小于 0 的数字。":
    "Both credit targets must be numbers greater than or equal to 0.",
  "两类学时目标必须合计 20 小时，且精确到秒。":
    "The two credit targets must total 20 hours and be precise to the second.",
  教师更新课程学时目标: "Teacher updated the class credit targets",
  "课程级学时目标已保存，学生端将按新目标计算进度。":
    "Class-level credit targets were saved. The student portal will calculate progress against the new targets.",
  "生成后 7 天": "7 days after generation",
  "已生成唯一邀请码与二维码，有效期为 7 天。":
    "A unique invitation code and QR code were generated and are valid for 7 days.",
  "已生成新的课程邀请，二维码将在几秒内可扫码。有效期为 7 天。":
    "A new course invitation was generated. The QR code will be scannable in a few seconds and is valid for 7 days.",
  "邀请码已撤销，学生将不能再凭此码加入课程。":
    "The invitation code was revoked. Students can no longer join the course with it.",
  "未能自动复制邀请码，请手动选择后复制。":
    "The invitation code could not be copied automatically. Select and copy it manually.",
  "课程邀请链接已复制。": "The course invitation link was copied.",
  "未能自动复制链接，请使用二维码或手动复制邀请码。":
    "The link could not be copied automatically. Use the QR code or copy the invitation code manually.",
  "二维码正在生成，请稍候再下载。":
    "The QR code is being generated. Please wait before downloading it.",
  "二维码已下载，可投影或发送给学生。":
    "The QR code was downloaded and can be projected or sent to students.",
  "当前浏览器不支持全屏展示，请使用下载或打印功能。":
    "This browser does not support fullscreen presentation. Use the download or print option instead.",
  "无法进入全屏展示，请检查浏览器权限。":
    "Fullscreen presentation could not start. Check your browser permissions.",
  "移出课程原因必填，学生将收到课程成员关系变更通知。":
    "A reason for removal is required. The student will receive a course-membership change notification.",
  "减免类别、减免时长和减免原因均为必填项，时长须大于 0。":
    "Adjustment category, duration, and reason are required, and the duration must be greater than 0.",
  "学时类型、1/2 小时时长、运动项目和补录原因均为必填项。":
    "Credit type, 1- or 2-hour duration, activity, and entry reason are required.",
  "有效学时只能为 0、1 或 2 小时，且学生可见的审查意见必填。":
    "Valid credits can only be 0, 1, or 2 hours, and a student-visible review comment is required.",
  "可计入时长已调整，当前页面统计将以审核状态重新计算。":
    "Counted duration was adjusted. Statistics on this page will be recalculated from the review status.",
  "请填写有效的耐力跑分钟和秒数。":
    "Enter valid endurance-run minutes and seconds.",
  "标记缺考时必须填写缺考原因。":
    "A reason is required when marking a student absent.",
  "已发布成绩已修改，审计来源已记录":
    "Published grade updated; audit source recorded",
  学生成绩已保存: "Student grade saved",
  "请确认这是内部成绩发布，不会向学生披露换算分或等级。":
    "Confirm this is an internal gradebook publication and will not disclose converted scores or bands to students.",
  全班成绩已发布: "Class grades published",
  "审核结果和学生可见的审核意见均为必填项。":
    "A review decision and student-visible review comment are required.",
  "通过耐力跑免测时必须设置 0–100 的内部自定义分数（不向学生披露）。":
    "A custom internal score from 0 to 100 is required when approving an endurance-run exemption; it is not disclosed to students.",
  "课程运动与其他运动抵扣之和必须大于 0，且不得超过 20 小时。":
    "Course-activity and other-activity offsets must total more than 0 and no more than 20 hours.",
  "申请已审核通过并同步成绩/抵扣结果":
    "Application approved and grade/offset result synchronized",
  "申请已驳回，学生可补充材料后重新提交":
    "Application rejected. The student can resubmit after adding materials.",
  已要求学生补充材料: "Student asked to provide more material",
  "组织成员资格变更，教师手动撤销抵扣。":
    "Organization membership changed; the teacher manually revoked the offset.",
  "组织认证抵扣已手动撤销，学生需通过正常打卡补足差额":
    "Organization-verification offset was manually revoked. The student must make up the difference through regular check-ins.",

  更多课程操作: "More class actions",
  查看邀请码: "View invitation code",
  课程目标: "Class targets",
  完成进度: "Completion progress",
  已完成: "Completed",
  暂无待审核记录: "No pending records",
  进入课程: "Open class",
  没有符合条件的课程: "No classes match the criteria",
  "切换课程状态后可查看其他教学班。":
    "Choose another class status to view other classes.",
  课程: "Class",
  排序: "Sort",

  全部课程: "All classes",
  优先处理: "Priority first",
  完成率从高到低: "Completion rate: high to low",
  姓名: "Name",
  显示: "Showing",
  人学时尚未达标: "students are below the credit target",
  总学时进度: "Total credit progress",
  学时不足: "Below credit target",
  未找到符合条件的学生: "No students match the criteria",
  "调整搜索或筛选条件后重试。": "Adjust the search or filters and try again.",

  "辅助置信度仅用于排序与提示，最终审核结果仍由教师确认。":
    "Assistance confidence is used only for sorting and guidance; the teacher confirms the final review result.",
  "新提交默认有效；辅助置信度仅用于发现异常，教师可将问题记录标记为无效。":
    "New submissions are valid by default. Assistance confidence only helps identify anomalies, and teachers can mark problematic records invalid.",
  打卡审核列表: "Check-in review list",
  条待审核记录: "pending records",
  涉及: "Involving",
  剩余学时: "Remaining credits",
  辅助置信度: "Assistance confidence",
  "根据定位、时长与凭证完整度生成，仅作为教师审核辅助。":
    "Generated from location, duration, and evidence completeness; it only assists teacher review.",
  条待处理: "pending items",
  暂无待办: "No pending items",
  尚待完成: "Still to complete",
  暂无记录: "No records yet",
  系统辅助置信度: "System assistance confidence",
  基于: "Based on",
  条记录: "records",
  查看记录: "View records",
  "← 返回学生名单": "← Back to student list",
  返回学生名单: "Back to student list",
  打卡记录: "Check-in records",
  已处理进度: "Processed progress",
  的全部打卡记录: "'s check-in records",
  "条记录；审核结果仅保存在当前页面，刷新后恢复默认状态。":
    " records; review results are saved only on this page and reset after refresh.",
  "条记录；审核结果已保存到后端，页面切换或刷新后会重新读取最新状态。":
    " records; review results are saved by the backend and reloaded after navigation or refresh.",
  审核状态筛选: "Review status filters",
  该学生尚无打卡记录: "This student has no check-in records yet",
  "学生提交的运动凭证会按日期出现在此处。":
    "Activity evidence submitted by the student will appear here by date.",
  当前筛选暂无记录: "No records match the current filter",
  "切换审核状态筛选可查看其他打卡记录。":
    "Choose another review status to view other check-in records.",
  打卡时间: "Check-in time",
  运动日期: "Activity date",
  运动信息: "Activity information",
  审核操作: "Review action",
  开始: "Start",
  结束: "End",
  图: "Image",
  无凭证: "No evidence",
  "实际运动：": "Actual activity: ",
  实际运动: "Actual activity",
  "可计入时长：": "Counted credits: ",
  "查看详情 →": "View details →",
  "查看完整记录 →": "View full record →",

  学生姓名: "Student name",
  异常: "Exception",
  成绩已发布: "Grades published",
  "导出 CSV": "Export CSV",
  成绩册: "Gradebook",
  耐力跑成绩: "Endurance-run grade",
  录入成绩: "Enter grade",
  编辑: "Edit",
  "查看 / 编辑": "View / edit",
  当前状态没有成绩记录: "No grade records for the current status",
  "切换成绩状态查看其他学生。":
    "Choose another grade status to view other students.",

  认证申请筛选工具栏: "Verification request filters",
  "搜索学生、学号或申请说明":
    "Search students, student IDs, or request descriptions",
  搜索认证申请: "Search verification requests",
  申请类型: "Request type",
  全部类型: "All types",
  免测与组织认证申请列表: "Exemption and organization-verification requests",
  条申请: "requests",
  申请说明: "Request description",
  材料: "Materials",
  该学生: "this student",
  份: "files",
  查看详情: "View details",
  重新处理: "Review again",
  当前分类没有申请: "No requests in this category",
  "新的申请或学生补充材料后会自动出现在对应列表。":
    "New requests and student-supplied materials will appear in the appropriate list automatically.",

  "审核意见会展示给学生。通过前将校验学生账号状态和“一学期一课”约束。":
    "The review comment is visible to the student. Approval checks account status and the one-class-per-term rule.",
  "该生本学期已有 ACTIVE 体育课，不能直接通过第二门课。":
    "This student already has an ACTIVE physical education class this term, so the second class cannot be approved directly.",
  "减免后，学生端将按新的目标计算剩余学时；原有打卡记录和已获得学时保持不变。":
    "After the adjustment, the student portal calculates remaining credits from the new target; existing check-ins and earned credits remain unchanged.",
  前端审核原型: "Front-end review prototype",
  "请选择最符合本条记录的原因。取消不会改变当前审核状态。":
    "Select the reason that best fits this record. Canceling does not change the current review status.",
  确认标记无效: "Confirm invalid",
  其他原因备注: "Other reason note",
  备注仅保存在当前页面状态中:
    "This note is saved only in the current page state",
  请简要说明无效原因: "Briefly explain why this record is invalid",
  完成前确认: "Pre-completion confirmation",
  "确认后仅在当前前端页面标记为“审核已完成”，不会发送接口请求。":
    "Confirming marks the review complete only on this front-end page and does not send an API request.",
  返回检查: "Back to review",
  确认完成审核: "Confirm review completion",
  有效记录: "Valid records",
  无效记录: "Invalid records",
  目标完成: "Target completion",
  已达到教师设置目标: "Teacher-configured target reached",
  可计入时长: "Counted duration",
  "· 置信度": "· confidence ",
  预览原件: "Preview original",
  保存成绩: "Save grade",
  "该成绩已发布；保存修改后会立即更新学生端、发送强制通知并记录审计来源。":
    "This grade is published. Saving changes updates the student portal immediately, sends a mandatory notification, and records the audit source.",
  "审核意见会展示给学生；社团负责人不参与系统审核。":
    "The review comment is visible to the student; club leaders do not participate in system review.",
  耐力跑换算表: "Endurance-run conversion table",
  打卡时间窗: "Check-in time window",
  "只维护四套耐力跑换算表。运动模板不在本页；学时目标由任课教师在教学班配置。":
    "This page only maintains the four conversion tables. Sport templates are not edited here; credit targets are set by the instructor for each class.",
  打卡凭证审核工具: "Check-in evidence review tool",
  份材料: "evidence items",
  下载原件: "Download original",
  选择要审核的凭证: "Select evidence to review",
  视频: "Video",
  暂停视频: "Pause video",
  播放视频: "Play video",
  播放或暂停视频: "Play or pause video",
  视频播放进度: "Video playback progress",
  图片缩放控制: "Image zoom controls",
  缩小图片: "Zoom out",
  恢复原始缩放: "Reset zoom",
  放大图片: "Zoom in",
  "视频可播放并核对时长、场景与运动过程。":
    "Play the video to verify duration, scene, and activity process.",
  "可缩放图片，核对时间、场景及运动凭证细节。":
    "Zoom the image to verify the time, scene, and evidence details.",
  定位数据已过期: "Location data expired",
  "超过 90 天的原始定位已按规则清除，当前不可查看地图。":
    "Original location data older than 90 days has been removed and the map is unavailable.",
  已脱敏的校园运动区域地图: "Masked campus activity-area map",
  "校园运动区域（已脱敏）": "Campus activity area (masked)",
  "仅显示约 300m 范围和运动路径概览，不展示精确坐标。":
    "Only an approximately 300m area and route overview are shown; exact coordinates are hidden.",
  "已标记为无效，汇总有效时长已更新。":
    "Marked invalid. The valid-credit total has been updated.",
  "已标记为有效，汇总有效时长已更新。":
    "Marked valid. The valid-credit total has been updated.",
  "定位数据已过期，地图不可查看": "Location data expired; map unavailable",
  已提供脱敏地图与运动区域概览:
    "A masked map and activity-area overview are available",
  分: "points",
  "发布后形成内部成绩版本。学生只看原始用时、免测和打卡分钟，不看换算分或等级。":
    "Publication creates an internal gradebook version. Students only see confirmed times, exemptions, and check-in minutes—not converted scores or bands.",
  "内部发布不会向学生推送分数通知；之后如修正用时，只更新内部投影。":
    "Internal publication does not send score notifications to students. Later time corrections only update the internal projection.",
  名单对齐: "Roster Reconciliation",
  已正确加入: "Matched",
  未加入课程: "Not joined",
  加错课程: "Wrong course",
  非官方名单成员: "Not in official roster",
  信息不一致: "Information mismatch",
  疑似匹配: "Possible match",
  重复记录: "Duplicate",
  待人工确认: "Pending confirmation",
  待确认: "Pending",
  已确认: "Confirmed",
  行政班: "Administrative class",
  教学班编号: "Teaching class code",
  "文件格式错误，请上传 .xlsx、.xls 或 .csv 文件。":
    "Unsupported file format. Upload an .xlsx, .xls, or .csv file.",
  "文件为空，或文件中没有可导入的数据。":
    "The file is empty or contains no importable data.",
  "文件过大，请将名单控制在 100 MB 以内。":
    "The file is too large. Keep the roster within 100 MB.",
  "名单正在更新，请在核对完成后重试。":
    "The roster is updating. Try again after reconciliation finishes.",
  "核对中": "Reconciling",
  "审核结果由服务器保存。退回补证和判无效必须选择公开原因，可补充说明；每条记录只有一次补证机会。": "The server saves review decisions. Returning evidence or marking a record invalid requires a public reason, with optional notes. Each record has one opportunity to provide supplementary evidence.",
  "该记录已使用过一次补证，请复核现有材料后选择通过或无效。": "This record has already used its supplementary evidence opportunity. Review the existing evidence and approve it or mark it invalid.",
  "课程已创建，请配置并发布规则。": "The course has been created. Configure and publish its rules.",
  "课程已发布，规则和时间安排已锁定。": "The course is published. Its rules and schedule are locked.",
  "请选择已发布的规则模板。": "Select a published rule template.",
  "发布课程前请将打卡状态设为“允许打卡”，并配置可完成目标的运动时间。": "Before publishing the course, enable check-ins and configure exercise times that allow students to reach the target.",
  "上次发布结果尚未确认，请先按原内容重试并核对结果。": "The previous publication result is unconfirmed. Retry with the original content and verify the result first.",
  "课程时间窗与 V8.1 规则已发布。": "The course time windows and V8.1 rules have been published.",
  "请先读取当前课程邀请码。": "Load the current course invitation code first.",
  "待处理与无效": "Pending and invalid",
  "待审核记录按服务端处理状态展示。人工审核模式下由责任教师核对材料；退回补证和判无效需选择公开原因。": "Review records are shown by their server status. In manual review mode, the responsible teacher checks the evidence. Returning evidence or marking a record invalid requires a public reason.",
  "当前没有待处理或无效记录": "There are no pending or invalid records.",
  "课程使用已发布的 V8.1 规则模板。": "The course uses a published V8.1 rule template.",
  "总目标为 1,200 分钟。课程发布后，最低运动时长、周频次和时间安排锁定。": "The total target is 1,200 minutes. Exercise thresholds, weekly frequency and scheduling are locked after publication.",
  "请选择已发布模板": "Select a published template",
  "请选择总管理员已发布的模板。": "Select a template published by the super administrator.",
  "总目标": "Total target",
  "按当前课程规则累计有效运动，目标合计 20 小时。": "Accumulate valid exercise under the current course rules toward a total target of 20 hours.",
  "撤销后，当前二维码、邀请码和未完成的入班宽限立即失效，已经加入课程的学生不受影响。": "Revocation immediately invalidates the current QR code, invitation code and pending join grace periods. Students already enrolled remain in the course.",
  "请选择公开原因和补证窗口。确认后服务器会退回本条记录，学生可在期限内补充一次材料。": "Select a public reason and an evidence window. After confirmation, the server returns the record and the student may provide supplementary evidence once before the deadline.",
  "该结果已被新的核对修订替代，请关闭详情并重新核对后查看最新结果。":
    "A newer reconciliation revision has replaced this result. Close the details and reconcile again to view the latest results.",
  "文件解析失败，请检查文件是否损坏或受密码保护。":
    "File parsing failed. Check whether the file is damaged or password-protected.",
  "缺少必填字段：学号。": "Required field missing: student number.",
  "导入失败，请检查文件后重试。":
    "Import failed. Check the file and try again.",
  "名单对齐数据加载失败，请重试。":
    "Roster reconciliation data failed to load. Try again.",
  "对齐完成；结果已保存到当前前端演示会话，尚未写入服务器。":
    "Reconciliation completed. Results are saved in this front-end demo session and have not been written to the server.",
  "重新对齐失败，请检查网络后重试。":
    "Reconciliation failed. Check the network and try again.",
  "处理状态已保存在当前前端演示会话，尚未写入服务器。":
    "The resolution status is saved in this front-end demo session and has not been written to the server.",
  "处理状态更新失败，请重试。":
    "The resolution status could not be updated. Try again.",
  "已导出当前筛选结果。": "The current filtered results were exported.",
  "导出失败，请重试。": "Export failed. Try again.",
  "名单对齐数据暂时不可用。":
    "Roster reconciliation data is temporarily unavailable.",
  尚未导入官方名单: "No official roster imported",
  "导入学校提供的 Excel 或 CSV 名单后，系统会按学号自动比对当前课程成员。":
    "Import the university-provided Excel or CSV roster to compare current class members by student number.",
  导入官方名单: "Import official roster",
  "当前为前端 Mock 服务；导入内容仅保存在本次浏览器会话，不会写入学校服务器。":
    "This is a front-end mock service. Imported content is saved only for this browser session and is not written to the university server.",
  "导入成功并完成对齐；数据仅保存在当前前端演示会话。":
    "Import and reconciliation completed. Data is saved only in the current front-end demo session.",
  正在对齐: "Reconciling",
  重新对齐: "Reconcile again",
  导出结果: "Export results",
  名单版本和更新时间: "Roster version and update times",
  当前名单版本: "Current roster version",
  官方名单更新时间: "Official roster updated",
  平台名单更新时间: "Platform roster updated",
  最近一次对齐: "Last reconciled",
  名单对齐概览: "Roster reconciliation overview",
  官方名单总人数: "Official roster total",
  平台当前人数: "Current platform total",
  已正确加入人数: "Matched students",
  未加入人数: "Not joined",
  加错课程人数: "Wrong-course students",
  其他异常人数: "Other exceptions",
  其他异常: "Other exceptions",
  名单对齐筛选工具栏: "Roster reconciliation filters",
  已选择: "Selected",
  批量确认: "Confirm selected",
  批量标记已处理: "Mark selected resolved",
  搜索姓名或学号: "Search name or student number",
  对齐状态: "Reconciliation status",
  全部对齐状态: "All reconciliation statuses",
  全部处理状态: "All resolution statuses",
  课程筛选: "Class filter",
  全部相关课程: "All related classes",
  待处理优先: "Pending first",
  按学号: "By student number",
  按姓名: "By name",
  最近更新: "Recently updated",
  对齐结果: "Reconciliation results",
  "条记录，异常和待处理记录优先显示。":
    "records; exceptions and pending records are shown first.",
  清除筛选: "Clear filters",
  没有符合筛选条件的记录: "No records match the filters",
  "调整搜索或筛选条件后再试。": "Change the search or filters and try again.",
  选择当前页全部记录: "Select all records on this page",
  官方课程: "Official class",
  当前加入课程: "Current class",
  官方信息: "Official information",
  平台信息: "Platform information",
  差异说明: "Difference explanation",
  查看差异详情: "View difference details",
  标记为已确认: "Mark confirmed",
  标记为已处理: "Mark resolved",
  恢复为待处理: "Restore to pending",
  第: "Page",
  页: "page",
  "教师备注已保存在当前前端演示会话，尚未写入服务器。":
    "The teacher note is saved in this front-end demo session and has not been written to the server.",
  返回课程管理: "Back to Class Management",
  "课程管理 · 名单对齐": "Class Management · Roster Reconciliation",
  正在加载名单对齐数据: "Loading roster reconciliation data",
  "正在获取官方名单、平台成员和最近一次对齐结果。":
    "Fetching the official roster, platform members, and latest reconciliation results.",
  名单对齐加载失败: "Roster reconciliation failed to load",
  差异详情: "Difference details",
  系统判定依据与教师处理记录: "System rationale and teacher action history",
  关闭差异详情: "Close difference details",
  系统判定原因: "System rationale",
  官方名单信息: "Official roster information",
  官方归属课程: "Officially assigned class",
  平台学生信息: "Platform student information",
  差异字段: "Different fields",
  "主要身份字段无差异。": "No differences in the main identity fields.",
  "官方：": "Official:",
  "平台：": "Platform:",
  教师备注: "Teacher note",
  记录核实情况或后续处理计划: "Record verification findings or next steps",
  最近操作记录: "Recent actions",
  "后续操作（等待真实后端）": "Future actions (awaiting the real backend)",
  通知学生: "Notify student",
  调整到正确课程: "Move to correct class",
  从当前课程移除: "Remove from current class",
  修改平台信息: "Edit platform information",
  "这些操作尚未接入服务器，不会伪造处理成功。调整课程或移除成员上线前必须增加对象、范围和不可逆风险的二次确认。":
    "These actions are not connected to the server and will not pretend to succeed. Moving or removing members must show a second confirmation with the target, scope, and irreversible risks before launch.",
  恢复待处理: "Restore pending",
  正在保存: "Saving",
  保存备注: "Save note",
  标记已确认: "Mark confirmed",
  标记已处理: "Mark resolved",
  执行名单对齐: "Run roster reconciliation",
  更新教师备注: "Update teacher note",
  "官方名单导入 · 第": "Official roster import · Step",
  "步，共 3 步": "of 3",
  关闭导入: "Close import",
  导入进度: "Import progress",
  "1 选择并预览": "1 Select and preview",
  "2 字段映射": "2 Map fields",
  "3 校验并导入": "3 Validate and import",
  正在解析文件: "Parsing file",
  选择学校官方课程名单: "Select the university official class roster",
  选择学校官方课程名单文件: "Select the university official class roster file",
  "支持 .xlsx、.xls 和 .csv，最大 10 MB、最多 10,000 行。学号始终按字符串处理。":
    "Supports .xlsx, .xls, and .csv up to 10 MB and 10,000 rows. Student numbers are always treated as strings.",
  "电子表继续走现有导入接口。纸质 OCR 依次调用 allocate、importRosterOcrDraft；确认走 confirmRosterOcrDraft。未确认草稿不会当成当前快照。":
    "Spreadsheets still use the current import API. Paper OCR calls allocate then importRosterOcrDraft; confirmation uses confirmRosterOcrDraft. Unconfirmed drafts are not the current snapshot.",
  "纸质名单 OCR 只接受 JPEG/PNG。":
    "Paper-roster OCR accepts JPEG/PNG only.",
  "演示模式不把纸质 OCR 写成正式名单。":
    "Demo mode does not write paper OCR as a real roster.",
  "未读到 Contract 课程 version，不能猜测 expectedCourseVersion。":
    "Contract course version is missing; expectedCourseVersion is not guessed.",
  "OCR 草稿已导入。状态为 DRAFT，确认前不是当前名单。":
    "The OCR draft was imported. Status is DRAFT and it is not the current roster before confirmation.",
  "OCR 返回了非 DRAFT 状态。本页仍不把它当成当前快照，除非调用确认接口成功。":
    "OCR returned a non-DRAFT status. This page still does not treat it as the current snapshot until confirmation succeeds.",
  "服务端已确认当前快照。本页不把未刷新的本地表格当成新名单。":
    "The server confirmed the current snapshot. This page does not treat an unrefreshed local table as the new roster.",
  确认OCR草稿: "Confirm OCR draft",
  "确认 OCR 草稿": "Confirm OCR draft",
  "纸质 OCR 草稿": "Paper OCR draft",
  "纸质 OCR 草稿 ·": "Paper OCR draft ·",
  "行 ·": "rows ·",
  "OCR 上传授权已申请。请等待教师确认草稿；未确认前不会当成当前名单。":
    "OCR upload allocation was requested. Wait for the teacher to confirm the draft; it is not the current roster before confirmation.",
  扫描纸质名单: "Scan paper roster",
  正在解析: "Parsing",
  选择文件: "Choose file",
  "扫描纸质名单 OCR": "Scan paper roster OCR",
  "当前接口没有纸质名单 OCR 草稿，不能写入。":
    "The current API has no paper-roster OCR draft, so it cannot be written.",
  行数据: "data rows",
  更换文件: "Choose another file",
  数据预览: "Data preview",
  显示前: "Showing the first",
  "行；确认表头和学号前导零是否正确。":
    "rows; verify the headers and leading zeros in student numbers.",
  字段映射: "Field mapping",
  "系统已自动识别常见表头。学号为必填核心匹配字段，姓名仅用于辅助校验。":
    "Common headers were detected automatically. Student number is the required primary match field; name is only an auxiliary check.",
  不导入此字段: "Do not import this field",
  有效数据: "Valid rows",
  异常数据: "Invalid rows",
  总数据行: "Total rows",
  "异常行不会导入；重复学号的所有相关记录需要先在源文件中确认。":
    "Invalid rows will not be imported. Confirm every duplicate student number in the source file first.",
  行: "row",
  另有: "Another",
  "条异常未展开。": "errors are not expanded.",
  该课程已有官方名单: "This class already has an official roster",
  "当前版本为 v": "The current version is v",
  "。请选择本次导入方式，不会直接覆盖。":
    ". Choose how to import; the current roster will not be overwritten automatically.",
  创建新版本: "Create a new version",
  "保留当前版本记录，并将本次名单设为最新版本。":
    "Keep the current version record and make this roster the latest version.",
  替换当前官方名单: "Replace the current official roster",
  "替换当前版本内容；历史版本能力仍由数据结构预留。":
    "Replace the current version contents; the data model still reserves historical-version support.",
  "当前使用前端 Mock Service。确认后会在本次浏览器会话中保存名单并自动重新对齐，不会修改学校服务器或真实学生成员关系。":
    "The front-end Mock Service is active. Confirming saves the roster for this browser session and reruns reconciliation without changing the university server or real memberships.",
  取消导入: "Cancel import",
  校验数据: "Validate data",
  正在导入并对齐: "Importing and reconciling",
  确认导入并对齐: "Confirm import and reconcile",
  教师备注已更新: "Teacher note updated",
  教师备注已清空: "Teacher note cleared",
  "学号及主要身份信息与官方名单一致。":
    "The student number and primary identity fields match the official roster.",
  "姓名一致但学号不同，系统不会自动认定为同一学生，需要教师人工确认。":
    "The name matches but the student number does not. The system will not treat these records as the same student without teacher confirmation.",
  "该学生存在于官方名单，但平台当前没有相同学号的课程成员。":
    "The student is on the official roster, but the platform has no class member with the same student number.",
  "该平台课程成员的学号未出现在本课程或教师其他课程的官方名单中。":
    "This platform member's student number does not appear on the official roster for this class or the teacher's other classes.",
  体测免测: "Physical-test exemption",
  运动打卡减免: "Exercise check-in exemption",
  历史体测免测: "Legacy physical-test exemption",
  历史运动打卡减免: "Legacy exercise check-in exemption",
  特殊情况: "Special circumstances",
  真实凭证受安全访问控制保护: "Genuine evidence is protected by access controls",
  "点击下方按钮获取短期签名地址，并在新窗口查看服务端原件。此处不会显示固定占位图。":
    "Use the button below to obtain a short-lived signed URL and view the server original in a new window. No fixed placeholder is shown here.",
  查看真实凭证: "View genuine evidence",
  "该学生的全部记录均已在服务端完成审核，无需额外提交完成标记。":
    "All records for this student have been reviewed on the server; no extra completion marker is required.",
  "打卡时间窗已保存到后端；20 小时总目标由服务端成绩规则统一裁决。":
    "The check-in window was saved to the backend; the server score rule owns the 20-hour total target.",
  "该操作没有已批准的后端能力，真实模式不会创建本地补录或减免事实。":
    "This action has no approved backend capability. Real mode will not create local supplemental-credit or waiver facts.",
  "缺少服务端成员关系版本，请刷新后重试。":
    "The server enrollment version is missing. Refresh and try again.",
  "该学生尚无服务端成绩投影，需先由服务端成绩任务生成后才能重新计算。":
    "This student has no server score projection. The server score job must generate one before recalculation.",
  "服务端已重新计算该学生成绩。发布前学生端不会看到未发布分数。":
    "The server recalculated this student's score. Unpublished scores remain hidden from the student.",
  "当前没有可发布的服务端成绩；缺失成绩投影的学生不会被伪造为已发布。":
    "There are no server scores available to publish. Students without a score projection will not be marked as published.",
  "缺少申请版本，请刷新后重试。":
    "The application version is missing. Refresh and try again.",
  "免测/减免申请审核结果已保存到服务端；该操作不会伪造成绩或抵扣时长。":
    "The exemption decision was saved to the server; it does not fabricate a score or duration offset.",
  "浏览器阻止了新窗口，请允许弹窗后再次点击查看凭证。":
    "The browser blocked the new window. Allow pop-ups and click the evidence again.",
  成绩规则: "Score rule",
  "演示模式可调整两类展示目标。": "Demo mode can adjust the two display-only targets.",
  "服务端采用 TOTAL_ONLY 规则，不设置课程/自主运动分类配额。":
    "The server uses a TOTAL_ONLY rule and does not set course/independent activity quotas.",
  "当前权威要求为累计有效运动 20 小时。分类时长仅用于展示，不作为单独达标门槛；教师不能在此页面创建本地覆盖规则。":
    "The authoritative requirement is 20 total valid exercise hours. Categories are display-only and teachers cannot create local override rules here.",
  "v8.0 总目标为 1,200 分钟，门槛与周频次由已发布模板锁定。当前接口仍按累计有效运动 20 小时 TOTAL_ONLY 裁决；本页不能改公式，也不能把目标改成 30/45/60 分钟门槛。":
    "v8.0 locks a 1,200-minute total and template thresholds. The current API still judges 20 valid hours TOTAL_ONLY; this page cannot change the formula or switch to 30/45/60-minute thresholds.",
  选择已发布模板: "Select a published template",
  当前接口没有已发布模板: "No published template in the current API",
  "当前接口没有模板锁定操作，不能写入。":
    "The current API has no template-lock operation, so it cannot be written.",
  "发布后参数锁定，不能改模板":
    "Published parameters are locked; the template cannot be changed.",
  "已发布课程的门槛与周频次锁定。创建课程前请在管理端发布模板并用 createCourse.sportTemplateId。":
    "Published-course thresholds and weekly frequency stay locked. Publish a template in admin and pass createCourse.sportTemplateId before creating a course.",
  "邀请有效期须为至少 5 的整数分钟，且截止时间须为有效日期。":
    "Invitation duration must be a whole number of at least 5 minutes with a valid expiry date.",
  "缺少课程版本，无法按 Contract 生成邀请。":
    "The course version is missing, so a Contract invitation cannot be created.",
  "该操作没有已批准的后端能力，真实模式不会创建本地减免事实。":
    "This action has no approved backend capability, so live mode will not create a local waiver.",
  "学时类别、1–60 整分钟、运动项目和补录原因均为必填项。":
    "Credit category, 1–60 whole minutes, sport, and makeup reason are required.",
  "缺少成员关系或课程版本，无法补录。":
    "Enrollment or course version is missing, so makeup cannot be submitted.",
  "已提交教师补录。服务端确认前不会在本地假装已计入。":
    "Teacher makeup was submitted. It is not treated as credited until the server confirms.",
  "邀请码失效后不能再用于加入课程。有效期 5–120 分钟，到期后仅一次 10 分钟宽限且不得刷新。":
    "An expired invitation cannot be used to join. Duration is 5–120 minutes; after expiry there is one 10-minute grace window that cannot be refreshed.",
  "邀请有效期（分钟）": "Invitation duration (minutes)",
  "5–120，默认 30。到期后仅允许一次 10 分钟宽限，不能刷新续期。":
    "5–120 minutes, default 30. After expiry there is one 10-minute grace window that cannot be refreshed.",
  "新提交按 Contract 应为待 AI 初审，现网旧接口仍可能默认有效。退回补证只展示流程设计，当前正式协议不会写入。":
    "New submissions should be awaiting AI check under Contract; the live legacy API may still default to valid. Return-for-proof is display-only and is not written on the current official contract.",
  "演示模式不把退回补证写成正式结果。":
    "Demo mode does not write return-for-proof as a real result.",
  "请填写学生可见的退回原因（自由文本，暂无固定分类清单）。":
    "Enter a student-visible return reason as free text. There is no frozen public category list yet.",
  "请选择一项适用于退回补证的固定公开原因。":
    "Choose one fixed public reason that applies to return-for-proof.",
  "请选择一项适用于判为无效的固定公开原因。":
    "Choose one fixed public reason that applies to marking invalid.",
  "已提交退回补证。服务端确认前不会在本地假装已退回。":
    "Return-for-proof was submitted. It is not treated as returned until the server confirms.",
  "找不到该打卡记录。": "That check-in record was not found.",
  "Contract 退回补证": "Contract return-for-proof",
  "原因使用自由文本。PENDING-UI-P2W2-01 固定分类仍暂缓。窗口从服务器确认退回时起算。":
    "Use free-text reasons. PENDING-UI-P2W2-01 frozen categories remain deferred. The window starts when the server confirms the return.",
  "必须选择一项适用于退回补证的固定公开原因。可选一句公开补充说明保留原文。窗口从服务器确认退回时起算。BD-20260904-01 已关闭原待定分类。":
    "Choose one fixed public reason that applies to return-for-proof. An optional public note is kept in the original language. The window starts when the server confirms the return. BD-20260904-01 closed the previous pending category list.",
  "必须选择一项适用于判为无效的固定公开原因。可选一句公开补充说明保留原文。不能选择仅适用于退回的分类，也不提供其他兜底项。":
    "Choose one fixed public reason that applies to marking invalid. An optional public note is kept in the original language. Return-only categories and an Other fallback are not available.",
  退回补证公开原因: "Return-for-proof public reason",
  "公开补充说明（可选，保留原文）": "Public supplemental note (optional, original language)",
  "不能代替固定分类，也不增加其他兜底项。":
    "This does not replace the fixed category and does not add an Other fallback.",
  "补充说明不能代替固定分类。": "A supplemental note cannot replace the fixed category.",
  "通过与无效仍可走现有审核接口。退回补证和判无效必须选择 V8.1 六类固定公开原因，可再写一句公开补充说明；不再使用自由文本或其他兜底项。退回补证当前只核对流程，不会向服务器发送非正式写入。":
    "Pass and invalid still use the current review API. Return-for-proof and mark-invalid must use a V8.1 fixed public reason, with an optional original-language public note. Free text and an Other fallback are not used. Return-for-proof currently only checks the flow and does not send an unofficial write.",
  "按 V8.1 展示通过 / 退回补证 / 无效。退回与判无效必须选择六类固定公开原因；通过与无效仍写入现有接口。退回补证仅作流程设计，正式协议 1.2.0 不会发送写入。":
    "Show pass / return-for-proof / invalid per V8.1. Return and invalid require one of the six fixed public reasons. Pass and invalid still write the current API. Return-for-proof is flow design only and is not written on Contract 1.2.0.",
  "退回补证（展示设计）": "Return for proof (display design)",
  "必须选择一项适用于退回补证的固定公开原因。可选一句公开补充说明保留原文。当前正式协议 1.2.0 不能写入该动作；核对完成后不会向服务器发送请求。":
    "Choose one fixed public reason that applies to return-for-proof. An optional public note stays in the original language. Official Contract 1.2.0 cannot write this action, so confirming does not send a request.",
  "核对原因（不写入）": "Check reason (no write)",
  "当前正式协议 1.2.0 的审核结果只有有效 / 无效，不能写入退回补证。本对话框只用于核对原因和 24/72 小时窗口；下一步需独立 Contract CR，现在不会向服务器发送请求。":
    "Official Contract 1.2.0 review results are only valid or invalid, so return-for-proof cannot be written. This dialog only checks the reason and 24/72-hour window. A separate Contract CR is required next; no request is sent now.",
  "当前规则要求先授权补练时间窗口，再由学生实际运动并提交材料。本表单尚不支持窗口授权，不能直接增加学时。":
    "Current rules require a makeup window before the student exercises and submits evidence. This form does not yet support window authorization and cannot directly add credited time.",
  "补练须先授权指定学生的时间窗口，再由学生实际运动并提交材料。本表单尚不支持窗口授权。":
    "Makeup exercise requires an authorized window for the selected student, followed by actual exercise and evidence submission. This form does not yet support window authorization.",
  "当前正式协议 1.2.0 没有教师补录接口。本对话框只用于流程设计，不会向服务器写入。":
    "Official Contract 1.2.0 has no teacher makeup endpoint. This dialog is flow design only and does not write to the server.",
  "按整分钟计入、单次最多 60 分钟。当前正式协议 1.2.0 没有教师补录写入接口，正式模式不会向服务器发送请求。":
    "Credit whole minutes, capped at 60 per record. Official Contract 1.2.0 has no teacher makeup write, so production mode does not send a request.",
  "已发布课程的门槛与周频次锁定。本轮不接入未发布的运动模板协议。":
    "Published-course thresholds and weekly frequency stay locked. This change set does not connect unpublished sport-template protocol.",
  确认退回补证: "Confirm return for proof",
  补证窗口: "Proof window",
  "24 小时": "24 hours",
  "72 小时": "72 hours",
  学生可见原因: "Student-visible reason",
  "自由文本，不是固定公开分类。": "Free text, not a frozen public category.",
  "仅作对照显示；服务端仍按 20 小时 TOTAL_ONLY 裁决。":
    "Shown for comparison only; the server still judges 20 hours TOTAL_ONLY.",
  "v8.0 总目标": "v8.0 total target",
  整分钟计入: "Whole-minute credit",
  "当前补录接口只能写 1 或 2 小时，不能改成整分钟。":
    "The current makeup API can only write 1 or 2 hours and cannot switch to whole minutes.",
  "向学生披露换算分、等级或排名": "Disclose converted scores, bands, or ranking to students",
  "当前接口不能把换算分发给学生，发布仍只形成内部成绩版本。":
    "The current API cannot send converted scores to students; publishing still creates an internal grade version only.",
  "内部自定义分与抵扣上限仍跟现有接口；换算分不向学生披露。":
    "Internal custom scores and offset caps still follow the current API; converted scores are not disclosed to students.",
  "当前接口不能向学生披露内部自定义分。":
    "The current API cannot disclose internal custom scores to students.",
  向学生披露内部自定义分: "Disclose internal custom scores to students",
  当前邀请码明文不会被重新读取: "The current invitation plaintext cannot be retrieved again",
  "如需重新展示，请生成新邀请码；服务端会同时使此前的有效邀请码失效。":
    "Generate a new invitation to display it again; the server will invalidate the previous active invitation.",
  替换课程邀请码: "Replace class invitation",
  "撤销后，当前二维码和邀请码将立即失效。":
    "After revocation, the current QR code and invitation become invalid immediately.",
  "服务端 API 不提供单独撤销接口。生成新邀请码会在同一服务端事务中使旧邀请码失效，且不会影响已经建立的成员关系。":
    "The backend API has no standalone revoke endpoint. Creating a new invitation invalidates the old one in the same server transaction without affecting existing enrollments.",
  生成新码并替换旧码: "Generate a new code and replace the old one",
  "先查看审核状态和计入时长，再核对原始记录与运动凭证；详情页仅用于查看。":
    "Review the status and counted duration first, then verify the original record and evidence. This detail view is read-only.",
  "先查看审核状态和计入时长，再核对服务端记录与真实运动凭证。":
    "Review the status and counted duration first, then verify the server record and genuine evidence.",
  打卡核心信息: "Key check-in information",
  "以原始开始和结束时间为准": "Based on the original start and end times",
  原始记录: "Original record",
  时间与说明: "Time and description",
  完成查看: "Done",
  "业务规则明确禁止教师覆盖计入时长。教师可以追加“有效/无效”审核记录，但不能在客户端改写服务端时长事实。":
    "The API prohibits teacher duration overrides. Teachers may append valid/invalid reviews but cannot rewrite server duration facts from the client.",
  服务端成绩: "Server score",
  "内部成绩由服务端按已审核记录与已生效规则计算；换算分不向学生披露，教师端不本地录入分数。":
    "The internal grade is calculated on the server from reviewed records and active rules. Converted scores are not disclosed to students; teachers do not enter scores locally.",
  重新计算: "Recalculate",
  尚未计算: "Not calculated",
  未发布: "Unpublished",
  "“重新计算”只请求服务端刷新成绩投影；不会创建本地分数，也不会自动发布。尚无成绩投影的学生会明确显示“未生成”。":
    "Recalculate only asks the server to refresh the score projection. It creates no local score and does not publish automatically. Missing projections are shown explicitly.",
  "只发布当前教学班中已由服务端生成且尚未发布的成绩投影；缺失投影的学生不会被伪造为已发布。":
    "Publish only server-generated, unpublished score projections for this class. Missing projections are never presented as published.",
  "发布请求逐条使用服务端版本控制。页面不会声称已经发送服务端 API 未保证的通知。":
    "Each publish request uses server version control. The page does not claim notifications that the API does not guarantee.",
  "该申请未附带可访问的服务端凭证。":
    "This application has no accessible server evidence.",
  "审核通过只改变申请状态；服务端不会因此自动生成分数或抵扣时长。":
    "Approval changes only the application status; the API does not automatically create a score or duration offset.",
  "真实服务端当前不返回风险或置信度；请依据记录与受保护凭证人工审核。":
    "The live server does not return risk or confidence values. Review the record and protected evidence manually.",
  "新提交默认有效；如凭证存在问题，请进入记录并手动标记为无效。":
    "New submissions are valid by default. If the evidence has a problem, open the record and mark it invalid manually.",
  "服务端未提供": "Not provided by the server",
  "风险辅助": "Risk assistance",
  "服务端正式审核": "Authoritative server review",
  "备注将随无效审核记录保存到服务端":
    "The note will be saved to the server with the invalid review record.",
  "服务端 API 当前未提供风险或置信度投影":
    "The server API currently exposes no risk or confidence projection.",
  "服务端教师投影当前不返回位置或地图数据":
    "The teacher projection currently returns no location or map data.",
  "查看服务端教学班、成员关系、时间窗与一次性课程邀请。":
    "View server class sections, enrollments, time windows, and one-time class invitations.",
  "查看真实课程成员、加入状态与服务端成绩进度。":
    "View genuine class members, enrollment status, and server score progress.",
  "依据服务端记录与受保护运动凭证追加有效或无效审核。":
    "Append a valid or invalid review based on the server record and protected exercise evidence.",
  "刷新内部成绩投影。换算分不向学生披露；客户端不录入或伪造分数。":
    "Refresh the internal grade projection. Converted scores are not disclosed to students; the client does not enter or invent scores.",
  "审核服务端免测申请；审核结论不会自动生成分数或抵扣时长。":
    "Review server exemption applications; a decision does not automatically create a score or duration offset.",
  "查看服务端学期状态；当前 API 不提供手工创建、切换或归档操作。":
    "View server term status; the current API does not provide manual creation, switching, or archiving.",
  "查看组织范围内的账号与角色资料；当前 API 不提供账号恢复、解锁或删除操作。":
    "View organization-scoped accounts and roles; the current API does not provide account recovery, unlocking, or deletion.",
  "查看组织范围内的用户反馈；当前 API 不提供回复或状态变更操作。":
    "View organization-scoped user feedback; the current API provides no reply or status mutation.",
  "查看学生端提交的问题类型和问题描述；当前 API 不提供回复或状态变更操作。":
    "View the problem category and description submitted by students; the current API provides no reply or status mutation.",
  "只维护四套耐力跑换算表。运动模板不在本页。":
    "This page only maintains the four endurance-run conversion tables. Sport templates are not edited here.",
  "查看当前服务端系统模式；客户端不显示当前 API 未开放的切换操作。":
    "View the current server system mode; the client hides switching actions not exposed by the API.",
  "查看服务端已发布的中英文帮助内容；当前客户端 API 不提供发布能力。":
    "View published Chinese and English server help; publication is outside the current client API.",
  "追踪服务端关键操作；审计记录只读，不可修改或删除。":
    "Trace important server operations; audit records are read-only and cannot be changed or deleted.",
  "请输入账号已绑定的完整邮箱地址。":
    "Enter the full email address linked to the account.",
  "密码恢复请求已失效，请返回登录页后重新发起。":
    "This password recovery request has expired. Return to sign in and start again.",
  "请输入邮箱收到的 4–10 位数字验证码。":
    "Enter the 4–10 digit verification code sent to your email.",
  "请输入新的个人密码。": "Enter a new personal password.",
  "系统仅使用后端认证与授权数据，并根据账号权限进入对应工作台":
    "The system uses only server authentication and authorization data and opens the workspace permitted for the account.",
  验证并设置新密码: "Verify and set a new password",
  "输入账号绑定邮箱和账号身份。后端会创建一次性恢复请求，并通过已配置的邮件服务发送验证码。":
    "Enter the account email and account role. The server will create a one-time recovery request and send a verification code through the configured email service.",
  账号身份: "Account role",
  管理员: "Administrator",
  账号绑定邮箱: "Account email",
  请输入完整学校邮箱: "Enter the full university email address",
  "正在提交…": "Submitting…",
  "恢复请求已由后端受理。请输入邮件验证码和新密码；成功后，该账号在所有设备上的旧登录状态将失效。":
    "The server accepted the recovery request. Enter the email verification code and a new password. After completion, existing sessions for this account on all devices will be invalidated.",
  "本次恢复请求有效期至：": "This recovery request expires at:",
  邮件验证码: "Email verification code",
  "请输入 4–10 位数字验证码": "Enter a 4–10 digit verification code",
  "请输入新的个人密码": "Enter a new personal password",
  "请输入非空的个人密码": "Enter a non-empty personal password",
  已输入密码: "Password entered",
  "正在验证…": "Verifying…",
  验证并重置密码: "Verify and reset password",
  "已登录状态下修改密码尚未纳入 Backend API；请退出后使用真实邮箱恢复流程重置密码。":
    "Changing a password while signed in is not yet part of the Backend API. Sign out and use the live email recovery flow to reset it.",
  已忽略: "Ignored",
  入学年份: "Entry year",
  学院: "School",
  "缺少必填字段：姓名。": "The required name field is missing.",
  "名单超过 500 行，请拆分或整理后重新导入。":
    "The roster exceeds 500 rows. Split or clean the file and import it again.",
  "文件格式错误，请上传 .xlsx 或 .csv 文件；旧版 .xls 请先另存为 .xlsx。":
    "Upload an .xlsx or .csv file. Save legacy .xls files as .xlsx first.",
  "支持 .xlsx、.xls 和 .csv": "Supports .xlsx, .xls, and .csv",
  "支持 .xlsx 和 .csv": "Supports .xlsx and .csv",
  "，最大 100 MB、最多 500 行。学号始终按字符串处理。":
    ", up to 100 MB and 500 rows. Student numbers are always treated as strings.",
  "后端未接受该名单版本，请根据校验结果修正文件后重试。":
    "The server rejected this roster version. Correct the file based on the validation results and try again.",
  "后端名单核对已完成，并生成新的不可变核对修订。":
    "Server roster reconciliation is complete and a new immutable reconciliation revision was created.",
  "已由后端记录确认原因。": "The server recorded the confirmation reason.",
  "已由后端重新打开该核对结果。": "The server reopened this reconciliation result.",
  "导入学校提供的 Excel 或 CSV 名单后，后端会校验并创建不可变名单版本；教师确认后再运行名单核对。":
    "After a university Excel or CSV roster is imported, the server validates it and creates an immutable roster version. The teacher can then run reconciliation.",
  "文件和字段映射将提交到真实后端；导入不会直接增删课程成员。":
    "The file and field mapping are submitted to the live server. Importing does not directly add or remove course members.",
  "后端已创建并验证新的官方名单版本；请点击“运行核对”生成结果。":
    "The server created and validated a new official roster version. Select Run reconciliation to generate results.",
  正在核对: "Reconciling",
  重新核对: "Reconcile again",
  运行核对: "Run reconciliation",
  "名单有效 / 异常": "Roster valid / exceptions",
  "后端已创建并验证新的官方名单版本；请运行核对生成最新结果。":
    "The server created and validated a new official roster version. Run reconciliation to generate the latest results.",
  "请填写本次确认或重新打开的原因。":
    "Enter the reason for confirming or reopening this result.",
  "后端未接受本次处理，请查看页面错误信息后重试。":
    "The server rejected this action. Review the page error and try again.",
  后端最近处理说明: "Latest server action note",
  本次处理原因: "Reason for this action",
  "必填；说明核实依据。该原因会写入后端审计与处理历史。":
    "Required. Describe the verification basis. The server stores this reason in the audit and action history.",
  受接口规则约束的处理范围: "API-governed action scope",
  "当前页面仅开放后端已支持的“确认异常”和“重新打开”。“已处理”必须附带可追溯证据引用；现有页面尚不能安全采集该证据，因此不会显示伪造入口。完整历史可在审计日志中查询。":
    "This page exposes only server-supported Confirm exception and Reopen actions. Marking an item resolved requires a traceable evidence reference, which this page cannot yet collect safely, so no fabricated action is shown. The complete history is available in the audit log.",
  正在提交: "Submitting",
  重新打开: "Reopen",
  确认该异常: "Confirm this exception",
  "字段名与服务端 API一致；学号和姓名均为必填字段，最终校验结果以后端为准。":
    "Field names follow the Backend API. Student number and name are required, and server validation is authoritative.",
  该教学班已有官方名单: "This class section already has an official roster",
  "。后端只允许创建新的不可变版本；历史版本会保留，本次导入验证通过后成为当前版本。":
    ". The server only creates new immutable versions. Historical versions remain available, and this import becomes current after validation succeeds.",
  "确认后会把原始文件和字段映射提交到后端，完成校验和名单确认；导入不会直接增删课程成员。":
    "Confirmation submits the original file and field mapping for validation and roster confirmation. Importing does not directly add or remove course members.",
  本地预检: "Local preflight validation",
  正在提交后端: "Submitting to server",
  确认创建新版本: "Confirm new version",
  未知: "Unknown",
  已计算: "Calculated",
  已锁定: "Locked",
  未生成: "Not generated",
  达标: "Meets target",
  未达标: "Below target",
  有效时长不足: "Insufficient valid duration",
  待计算: "Pending calculation",
  打开真实原件: "Open original evidence",
  "凭证内容来自后端短期签名地址；当前页面不缓存或替换真实媒体。":
    "Evidence is loaded from a short-lived server-signed URL. This page does not cache or substitute the original media.",
  位置投影未开放: "Location projection unavailable",
  "教师端后端投影当前不返回位置或地图数据；页面不会显示固定地图。":
    "The teacher server projection currently returns no location or map data, so the page does not display a fixed map.",
  "后端返回了无法关联学生身份资料的打卡记录，已停止展示不完整数据。":
    "The server returned a check-in record that could not be linked to a student identity profile, so incomplete data is not displayed.",
  "近 24 小时加入": "Joined in the last 24 hours",
  服务端成绩状态: "Server score status",
  已生成: "Generated",
  "本页只显示后端 StudentScore 投影；导出 API 当前为默认拒绝，因此不提供本地拼接 CSV。":
    "This page displays only the server StudentScore projection. Export is default-denied by the current API, so the client does not assemble a local CSV.",
  服务端成绩册: "Server gradebook",
  达标状态: "Target status",
  课程相关有效时长: "Course-related valid duration",
  其他有效时长: "Other valid duration",
  总有效时长: "Total valid duration",
  最终分数: "Final score",
  后端学生资料不可用: "Server student profile unavailable",
  "查看 / 重新计算": "View / recalculate",
  等待后端生成: "Waiting for server generation",
  当前筛选没有成绩投影: "No score projections match the current filter",
  "切换状态，或等待服务端成绩任务生成后再刷新。":
    "Change the status filter, or wait for the server score job to finish and refresh.",
  后端当前学期不可用: "Current server term unavailable",
  不会返回给学生: "Not returned to the student",
};

const originalTextNodes = new WeakMap<Text, string>();

const englishToChineseText = new Map(
  Object.entries(englishText)
    .filter(([, english]) => english.length > 0)
    .map(([chinese, english]) => [english, chinese]),
);

const chineseTextOverrides: Record<string, string> = {
  ADMIN: "管理员",
  "BNBU SPORTS": "BNBU 体育",
  "BNBU CAMPUS SPORTS": "BNBU 校园体育",
  SPORTS: "体育",
  "BEIJING NORMAL · HONG KONG BAPTIST UNIVERSITY": "北师香港浸会大学",
  "© 2026 Beijing Normal-Hong Kong Baptist University":
    "© 2026 北师香港浸会大学",
  "How to submit a sports check-in?": "如何提交运动打卡？",
  "How to apply for team or club credit?": "校队和社团成员如何申请学时抵扣？",
};

type StatusScope =
  "default" | "system" | "audit" | "grade" | "exemption" | "ticket" | "invite";

const statusSourceLabels: Record<StatusScope, Record<string, string>> = {
  default: {
    PENDING: "待审核",
    ACTIVE: "进行中",
    REJECTED: "已驳回",
    NEEDS_CORRECTION: "待补正",
    pending: "待审核",
    valid: "有效",
    invalid: "无效",
    approved: "已通过",
    rejected: "已驳回",
    supplement_required: "待补材料",
    NotRecorded: "待录入",
    Recorded: "已录入",
    Exempt: "免测",
    Absent: "缺考",
  },
  system: {
    NORMAL: "正常模式",
    MAINTENANCE: "维护模式",
  },
  audit: { pending: "待审核", valid: "有效", invalid: "无效" },
  grade: {
    NotRecorded: "待录入",
    Recorded: "已录入",
    Exempt: "免测",
    Absent: "缺考",
  },
  exemption: {
    pending: "待审核",
    supplement_required: "待补材料",
    approved: "已通过",
    rejected: "已驳回",
    revoked: "已撤销",
  },
  ticket: {
    待受理: "待受理",
    受理中: "受理中",
    待技术团队处理: "待技术团队处理",
    处理完成: "处理完成",
    已关闭: "已关闭",
  },
  invite: { 有效: "有效", 已撤销: "已撤销" },
};

/**
 * Converts persisted API enums to their Chinese display source. The language
 * boundary then localizes that source consistently, so callers never expose a
 * backend enum such as `MAINTENANCE` or `pending` directly in the UI.
 */
export function statusLabel(value: string, scope: StatusScope = "default") {
  return (
    statusSourceLabels[scope][value] ??
    statusSourceLabels.default[value] ??
    value
  );
}

function formatIsoDateTime(value: string, locale: Locale) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    hour === undefined ? 0 : Number(hour),
    minute === undefined ? 0 : Number(minute),
    second === undefined ? 0 : Number(second),
  );
  const hasTime = hour !== undefined && minute !== undefined;
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-CN", {
    year: "numeric",
    month: locale === "en" ? "long" : "numeric",
    day: "numeric",
    ...(hasTime
      ? {
          hour: "numeric",
          minute: "2-digit",
          ...(locale === "en" ? { hour12: true } : { hour12: false }),
        }
      : {}),
  }).format(date);
}

function formatEnglishMonthDay(month: string, day: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(2026, Number(month) - 1, Number(day)));
}

function formatEnglishMonthYear(year: string, month: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
  }).format(new Date(Number(year), Number(month) - 1, 1));
}

const dynamicText: Array<[RegExp, (...matches: string[]) => string]> = [
  [/^其中 (\d+) 位信息一致，(\d+) 位学号相同但信息需要核实。$/u, (_, matched, conflicts) => `${matched} have matching details; ${conflicts} have matching student numbers but details need checking.`],
  [/^(\d+) 位未进本班(，另有 \d+ 个重复学号需要核实)?。本班另有 (\d+) 位学生不在这份名单中。$/u, (_, missing, duplicate, extra) => `${missing} have not joined this class.${duplicate ? ` ${duplicate.match(/\d+/)?.[0]} duplicate student numbers need checking.` : ""} Another ${extra} class members are not on this list.`],
  [/^总目标为 ([\d,]+) 分钟。$/u, (_, minutes) => `The total target is ${minutes} minutes.`],
  [/^已发布：门槛 (\d+) 分钟，每周最多 (\d+) 次。$/u, (_, minutes, count) => `Published: minimum ${minutes} minutes, up to ${count} sessions per week.`],
  [/^结算报告 v(\d+) 已保存。$/u, (_, version) => `Settlement report v${version} saved.`],
  [/^邀请有效期（(天|小时|分钟)）$/u, (_,unit)=>`Invitation duration (${unit==='天'?'days':unit==='小时'?'hours':'minutes'})`],
  [/^常规截止日期是学生正常打卡首次提交的最后日期；其后 7 天用于审核、补证和获准补练。当前打卡结束日期晚于允许的最晚截止日期 (.*)，请先将打卡结束日期调整到该日期或之前。$/u, (_,date)=>`The regular deadline is the last day for initial exercise submissions. The next 7 days are for review, supplementary evidence and approved make-up exercise. The exercise end date is later than the latest permitted deadline, ${date}. Move the exercise end date to that day or earlier.`],
  [/^常规截止日期是学生正常打卡首次提交的最后日期；其后 7 天用于审核、补证和获准补练。可设置范围：(.*) ～ (.*)。不得早于打卡结束日期；学期结束前须保留完整 7 天收尾期。$/u, (_,min,max)=>`The regular deadline is the last day for initial exercise submissions. The next 7 days are for review, supplementary evidence and approved make-up exercise. Allowed range: ${min} to ${max}. It must not precede the exercise end date, and 7 full closing days must remain within the semester.`],
  [/^后端核对结果：官方名单或平台成员存在重复身份记录。 原始名单行：(.*)。$/u,
    (_, rows) => `The server found duplicate identities in the official roster or platform members. Original roster rows: ${rows}.`],
  [/^(\d{4})级$/, (_, year) => `Cohort ${year}`],
  [
    /^(大学体育（一）|羽毛球|篮球) · (\d+)班$/,
    (_, course, section) => `${translateText(course)} · Section ${section}`,
  ],
  [
    /^([A-Z]+\d+) · (\d+)班$/,
    (_, code, section) => `${code} · Section ${section}`,
  ],
  [/^(\d+) 名学生$/, (_, count) => `${count} students`],
  [/^显示 (\d+) 名学生$/, (_, count) => `Showing ${count} students`],
  [
    /^(\d+) 人学时尚未达标$/,
    (_, count) => `${count} students are below the credit target`,
  ],
  [
    /^(\d+) \/ (\d+) 人已达标$/,
    (_, qualified, total) => `${qualified} / ${total} students qualified`,
  ],
  [/^达标率 (\d+)%$/, (_, percent) => `Qualification rate ${percent}%`],
  [/^(\d+) 条待审核$/, (_, count) => `${count} pending`],
  [
    /^显示 (\d+) 条待审核记录$/,
    (_, count) =>
      `Showing ${count} pending record${count === "1" ? "" : "s"}`,
  ],
  [
    /^显示 (\d+) 条历史记录$/,
    (_, count) =>
      `Showing ${count} history record${count === "1" ? "" : "s"}`,
  ],
  [
    /^显示 (\d+) 条记录$/,
    (_, count) => `Showing ${count} record${count === "1" ? "" : "s"}`,
  ],
  [/^(\d+) 条$/, (_, count) => `${count} record${count === "1" ? "" : "s"}`],
  [/^打开(.*)的用户信息$/, (_, name) => `Open ${name}'s profile`],
  [/^涉及 (\d+) 名学生$/, (_, count) => `${count} students involved`],
  [/^显示 (\d+) 条申请$/, (_, count) => `Showing ${count} applications`],
  [/^共 (\d+) 条申请$/, (_, count) => `${count} applications in total`],
  [
    /^学生至少需要完成 (\d+(?:\.\d+)?) 小时课程相关运动。$/,
    (_, hours) =>
      `Students must complete at least ${hours} hours of course-related activity.`,
  ],
  [
    /^学生至少需要完成 (\d+(?:\.\d+)?) 小时自主运动。$/,
    (_, hours) =>
      `Students must complete at least ${hours} hours of independent activity.`,
  ],
  [
    /^目标 (\d+(?:\.\d+)?)h \+ (\d+(?:\.\d+)?)h$/,
    (_, course, other) => `Target ${course}h + ${other}h`,
  ],
  [/^(\d+) 小时$/, (_, hours) => `${hours} hour${hours === "1" ? "" : "s"}`],
  [/^(\d+) 次$/, (_, count) => `${count} check-in${count === "1" ? "" : "s"}`],
  [/^第 (\d+) 次提交$/, (_, count) => `Submission attempt ${count}`],
  [
    /^无效：(.*)$/,
    (_, detail) => {
      const [reason, ...remark] = detail.split("：");
      return `Invalid: ${translateText(reason)}${remark.length ? `: ${remark.join("：")}` : ""}`;
    },
  ],
  [/^(\d+) 项$/, (_, count) => `${count} item${count === "1" ? "" : "s"}`],
  [/^(\d+) 小时 (\d+) 分$/, (_, hours, minutes) => `${hours}h ${minutes}m`],
  [
    /^(\d+) 年 (\d+) 月$/,
    (_, year, month) => formatEnglishMonthYear(year, month),
  ],
  [/^(\d+) 日$/, (_, day) => day],
  [/^(\d+)班$/, (_, section) => `Section ${section}`],
  [/^今天 (\d{1,2}:\d{2}(?::\d{2})?)$/, (_, time) => `Today at ${time}`],
  [/^昨天 (\d{1,2}:\d{2}(?::\d{2})?)$/, (_, time) => `Yesterday at ${time}`],
  [
    /^(\d+) 小时前$/,
    (_, hours) => `${hours} hour${hours === "1" ? "" : "s"} ago`,
  ],
  [/^(\d+) 天前$/, (_, days) => `${days} day${days === "1" ? "" : "s"} ago`],
  [
    /^(\d{1,2})月(\d{1,2})日$/,
    (_, month, day) => formatEnglishMonthDay(month, day),
  ],
  [
    /^(\d{2})-(\d{2}) (\d{2}:\d{2})$/,
    (_, month, day, time) => `${formatEnglishMonthDay(month, day)}, ${time}`,
  ],
  [/^清除(.*)$/, (_, label) => `Clear ${translateText(label)}`],
  [
    /^还有 (\d+) 条记录未审核。$/,
    (_, count) =>
      `${count} record${count === "1" ? "" : "s"} still await review.`,
  ],
  [/^导航栏宽度 (\d+) 像素$/, (_, width) => `Navigation bar width: ${width}px`],
  [
    /^已打开 (.*) 的账号详情。$/,
    (_, name) => `Opened account details for ${name}.`,
  ],
  [
    /^系统已切换至 (.*)。$/,
    (_, mode) => `System switched to ${translateText(statusLabel(mode))}.`,
  ],
  [
    /^已打开「(.*)」编辑页。$/,
    (_, title) => `Opened the editor for “${translateText(title)}”.`,
  ],
  [/^(.*)已完成。$/, (_, action) => `${translateText(action)} completed.`],
  [/^(.*)，查看学生详情$/, (_, name) => `View ${name}'s student details`],
  [/^完成进度 (\d+)%$/, (_, percent) => `Completion progress: ${percent}%`],
  [/^(.*)审核状态$/, (_, subject) => `${translateText(subject)} review status`],
  [
    /^已超出目标 (\d+(?:\.\d+)?) 小时$/,
    (_, hours) => `Exceeded target by ${hours} hours`,
  ],
  [/^还差 (\d+(?:\.\d+)?) 小时$/, (_, hours) => `${hours} hours remaining`],
  [
    /^(\d+) 分钟前$/,
    (_, minutes) => `${minutes} minute${minutes === "1" ? "" : "s"} ago`,
  ],
  [/^(\d+) 分$/, (_, minutes) => `${minutes} min`],
  [/^(\d+)分$/, (_, score) => `${score} points`],
  [/^免测 (\d+)分$/, (_, score) => `Exempt · ${score} points`],
  [
    /^学生证明材料，共 (\d+) 份$/,
    (_, count) =>
      `Student supporting materials · ${count} file${count === "1" ? "" : "s"}`,
  ],
  [
    /^已创建 (.*) · (.*)，并自动关联当前教师与当前学期。$/,
    (_, name, section) =>
      `Created ${name} · ${translateText(section)} and linked it to the current teacher and term.`,
  ],
  [
    /^已将 (.*) 移出课程；原打卡和成绩保留为只读历史$/,
    (_, student) =>
      `${student} was removed from the course; previous check-ins and grades remain read-only history.`,
  ],
  [
    /^该类别最多还可减免 (\d+(?:\.\d+)?) 小时，请调整减免时长。$/,
    (_, hours) =>
      `This category can be adjusted by at most ${hours} more hours. Update the adjustment duration.`,
  ],
  [
    /^已为 (.*) 减免 (\d+(?:\.\d+)?) 小时(.*)，该类别还需完成 (\d+(?:\.\d+)?) 小时$/,
    (_, student, hours, category, remaining) =>
      `Adjusted ${hours} hours for ${student} in ${translateText(category)}; ${remaining} hours remain in this category`,
  ],
  [
    /^已为 (.*) 补录 (\d+(?:\.\d+)?) 小时(.*)学时，且不占用每日提交额度$/,
    (_, student, hours, category) =>
      `Added ${hours} ${translateText(category)} credits for ${student}; this does not use the daily submission allowance`,
  ],
  [
    /^仍有 (\d+) 名学生未录入耐力跑状态，请先录入成绩或标记缺考。$/,
    (_, count) =>
      `${count} student${count === "1" ? "" : "s"} still need an endurance-run status. Enter a grade or mark them absent first.`,
  ],
  [/^完成率 (\d+)%$/, (_, percent) => `Completion rate ${percent}%`],
  [/^选择 (.*)$/, (_, value) => `Select ${translateText(value)}`],
  [
    /^课程运动 (\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)h · 其他运动 (\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)h(?: · 已减免 (\d+(?:\.\d+)?)h)?$/,
    (_, course, courseTarget, other, otherTarget, waived) =>
      `Course activity ${course}/${courseTarget}h · Other activity ${other}/${otherTarget}h${waived ? ` · Adjusted ${waived}h` : ""}`,
  ],
  [/^总完成率 (\d+)%$/, (_, percent) => `Total completion ${percent}%`],
  [/^(.*)的打卡记录列表$/, (_, student) => `${student}'s check-in record list`],
  [/^凭证 (\d+)$/, (_, index) => `Evidence ${index}`],
  [
    /^(.*)的打卡凭证相册$/,
    (_, student) => `${student}'s check-in evidence album`,
  ],
  [/^查看 (.*)$/, (_, item) => `View ${item}`],
  [
    /^(.*)-成绩册\.csv$/,
    (_, course) => `${translateText(course)}-gradebook.csv`,
  ],
  [
    /^已导出 (.*) 的 CSV 成绩册。$/,
    (_, course) => `Exported the CSV gradebook for ${translateText(course)}.`,
  ],
  [/^(\d+) 份材料$/, (_, count) => `${count} file${count === "1" ? "" : "s"}`],
  [
    /^(.*) · 课程邀请$/,
    (_, course) => `${translateText(course)} · Class invitation`,
  ],
  [/^邀请码 (.*) 已复制。$/, (_, code) => `Invitation code ${code} copied.`],
  [
    /^将“(.*)”标记为无效$/,
    (_, sport) => `Mark “${translateText(sport)}” as invalid`,
  ],
  [
    /^完成 (.*) 的打卡审核$/,
    (_, student) => `Complete check-in review for ${student}`,
  ],
  [
    /^(.*) · (.*)打卡详情$/,
    (_, student, sport) =>
      `${student} · ${translateText(sport)} check-in details`,
  ],
  [
    /^已打开 (.*) 的前端预览。$/,
    (_, file) => `Opened the front-end preview for ${file}.`,
  ],
  [
    /^系统已按性别默认 (.*)，用时将依据“(.*)”换算表生成内部换算分，不向学生披露。$/,
    (_, distance, group) =>
      `The default distance is ${distance} based on gender. The internal converted score comes from the “${translateText(group)}” table and is not shown to students.`,
  ],
  [/^上一笔成绩请求结果未确认，请先以原成绩 (-?\d+) 重试。$/, (_, grade) => `The previous grade request is awaiting confirmation. Retry with the original grade ${grade} first.`],
  [/^有效期：(.*)$/, (_, date) => `Valid until: ${translateText(date)}`],
  [
    /^为 (.*) 创建运动任务$/,
    (_, course) => `Create activity task for ${translateText(course)}`,
  ],
  [
    /^审核 (.*) 的(.*)$/,
    (_, student, kind) => `Review ${translateText(kind)}: ${student}`,
  ],
  [
    /^(.*) · (.*)打卡审核$/,
    (_, student, sport) =>
      `${student} · ${translateText(sport)} check-in review`,
  ],
  [/^(.*) · 成绩录入$/, (_, student) => `${student} · Enter grades`],
  [
    /^发布 (.*) 成绩$/,
    (_, course) => `Publish grades: ${translateText(course)}`,
  ],
  [/^预览 (.*)$/, (_, file) => `Preview ${file}`],
  [
    /^(.*) 提交的(.*)证明材料，仅限本次审核使用。$/,
    (_, student, kind) =>
      `${student}'s ${translateText(kind)} supporting material. For this review only.`,
  ],
  [
    /^该类别还可减免 (\d+(?:\.\d+)?) 小时$/,
    (_, hours) =>
      `${hours} credits remain available for adjustment in this category`,
  ],
  [
    /^共 (\d+) 条记录；(.*)$/,
    (_, count, rest) =>
      `Total ${count} record${count === "1" ? "" : "s"}; ${translateText(rest)}`,
  ],
  [/^处理 (.*)$/, (_, value) => `Manage ${value}`],
  [
    /^官方名单中学号 (.*) 出现 (\d+) 次，需要先清理重复数据。$/,
    (_, number, count) =>
      `Student number ${number} appears ${count} times in the official roster. Resolve the duplicate data first.`,
  ],
  [
    /^平台课程中学号 (.*) 出现 (\d+) 次，可能由重复扫码或重复导入导致。$/,
    (_, number, count) =>
      `Student number ${number} appears ${count} times in the platform class, possibly due to repeated scanning or import.`,
  ],
  [
    /^学号完全一致，但 (.*) 与官方名单不同。$/,
    (_, fields) =>
      `The student number matches exactly, but ${fields} differs from the official roster.`,
  ],
  [
    /^该学生学号与本课程官方名单一致，但当前加入了“(.*)”，因此被标记为加错课程。$/,
    (_, course) =>
      `The student number matches this class's official roster, but the student joined “${translateText(course)}”, so the record is marked as wrong course.`,
  ],
  [
    /^该学生学号与本课程官方名单一致，但当前加入了另一门课程，因此被标记为加错课程。$/,
    () =>
      "The student number matches this class's official roster, but the student joined another class, so the record is marked as wrong course.",
  ],
  [
    /^该学生学号属于“(.*)”官方名单，但实际加入了本课程。$/,
    (_, course) =>
      `The student number belongs to the official roster for “${translateText(course)}” but the student joined this class.`,
  ],
  [
    /^该学生学号属于教师的另一门课程官方名单，但实际加入了本课程。$/,
    () =>
      "The student number belongs to the official roster for another class taught by this teacher, but the student joined this class.",
  ],
  [
    /^(.*) 条相同学号记录$/,
    (_, count) =>
      `${count} record${count === "1" ? "" : "s"} with the same student number`,
  ],
  [
    /^(.*) 条课程成员记录$/,
    (_, count) => `${count} class-member record${count === "1" ? "" : "s"}`,
  ],
];

function translateToEnglish(value: string) {
  const formattedDate = formatIsoDateTime(value, "en");
  if (formattedDate) return formattedDate;
  const exact = englishText[value];
  if (exact) return exact;
  for (const [pattern, replace] of dynamicText) {
    const match = value.match(pattern);
    if (match) return replace(...match);
  }
  return value;
}

function translateToChinese(value: string) {
  const formattedDate = formatIsoDateTime(value, "zh");
  if (formattedDate) return formattedDate;
  return (
    chineseTextOverrides[value] ?? englishToChineseText.get(value) ?? value
  );
}

function translateForLocale(value: string, locale: Locale) {
  const leadingWhitespace = value.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = value.match(/\s*$/)?.[0] ?? "";
  const core = value.slice(
    leadingWhitespace.length,
    value.length - trailingWhitespace.length,
  );
  if (!core) return value;
  const translated =
    locale === "en" ? translateToEnglish(core) : translateToChinese(core);
  return `${leadingWhitespace}${translated}${trailingWhitespace}`;
}

export function translateText(value: string) {
  return translateForLocale(value, "en");
}

export function LanguageToggle({
  locale,
  onChange,
  compact = false,
}: LanguageToggleProps) {
  return (
    <div
      className={`language-toggle ${compact ? "language-toggle-compact" : ""}`}
      aria-label={locale === "en" ? "Language" : "语言"}
      translate="no"
    >
      <button
        type="button"
        className={locale === "zh" ? "selected" : ""}
        aria-pressed={locale === "zh"}
        onClick={() => onChange("zh")}
      >
        中文
      </button>
      <button
        type="button"
        className={locale === "en" ? "selected" : ""}
        aria-pressed={locale === "en"}
        onClick={() => onChange("en")}
      >
        English
      </button>
    </div>
  );
}

function translateAttributes(root: HTMLElement, locale: Locale) {
  root
    .querySelectorAll<HTMLElement>(
      "[aria-label], [placeholder], [title], [alt]",
    )
    .forEach((element) => {
      if (element.closest('[translate="no"]')) return;
      for (const attribute of [
        "aria-label",
        "placeholder",
        "title",
        "alt",
      ] as const) {
        const original =
          element.dataset[
            `original${attribute.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}`
          ];
        const current = original ?? element.getAttribute(attribute);
        if (!current) continue;
        if (!original)
          element.dataset[
            `original${attribute.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}`
          ] = current;
        element.setAttribute(attribute, translateForLocale(current, locale));
      }
    });
}

function translateSubtree(root: HTMLElement, locale: Locale) {
  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (textWalker.nextNode()) textNodes.push(textWalker.currentNode as Text);

  textNodes.forEach((node) => {
    if (!node.parentElement) return;
    if (node.parentElement.closest('[translate="no"]')) return;
    const storedOriginal = originalTextNodes.get(node);
    const displayedValue = node.nodeValue ?? "";
    const original =
      storedOriginal &&
      (displayedValue === storedOriginal ||
        displayedValue === translateForLocale(storedOriginal, "en") ||
        displayedValue === translateForLocale(storedOriginal, "zh"))
        ? storedOriginal
        : displayedValue;
    originalTextNodes.set(node, original);
    if (node.parentElement.tagName === "OPTION") {
      // React's options use the Chinese display text as their default value.
      // Preserve that value before replacing the label so controlled selects continue to work.
      const option = node.parentElement as HTMLOptionElement;
      if (!option.dataset.originalValue) {
        option.dataset.originalValue = option.value;
        option.value = option.value;
      }
    }
    const nextValue = translateForLocale(original, locale);
    if (node.nodeValue !== nextValue) node.nodeValue = nextValue;
  });
  translateAttributes(root, locale);
}

export function LocalizedContent({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    document.title =
      locale === "en"
        ? "BNBU Physical Education Management Portal"
        : "BNBU 体育课程管理平台";
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        locale === "en"
          ? "A unified portal for BNBU physical education teachers and administrators."
          : "教师与管理员统一入口，按身份进入清晰、专注的职责工作台。",
      );
    translateSubtree(root, locale);
    const observer = new MutationObserver(() => translateSubtree(root, locale));
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [locale]);

  return (
    <div ref={rootRef} className="localized-content" data-locale={locale}>
      {children}
    </div>
  );
}
